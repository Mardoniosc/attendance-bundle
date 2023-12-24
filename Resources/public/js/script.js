/**
 * Novo SGA - Atendimento
 * @author Rogerio Lino <rogeriolino@gmail.com>
 */
var App = App || {};

(function () {
    "use strict";

    var defaultTitle = document.title;

    var app = new Vue({
        el: "#attendance",
        data: {
            tiposAtendimento: tiposAtendimento,
            servicosRealizados: [],
            servicosUsuario: JSON.parse(JSON.stringify(servicosUsuario)),
            usuario: {
                numeroLocal: local,
                tipoAtendimento: tipoAtendimento,
            },
            novoLocal: {
                numeroLocal: local,
                tipoAtendimento: tipoAtendimento,
            },
            atendimento: null,
            atendimentoInfo: null,
            atendimentos: [],
            redirecionarAoEncerrar: false,
            servicoRedirecionar: null,
            search: "",
            searchResult: [],
            usuarios: [],
            novoUsuario: null,
        },
        methods: {
            init: function (atendimento) {
                var self = this;

                this.atendimento = atendimento;

                if (!App.Notification.allowed()) {
                    $("#notification").show();
                }

                App.Websocket.connect();

                App.Websocket.on("connect", function () {
                    App.Websocket.emit("register user", {
                        secret: wsSecret,
                        user: usuario.id,
                        unity: unidade.id,
                    });
                });

                // ajax polling fallback
                App.Websocket.on("reconnect_failed", function () {
                    App.Websocket.connect();
                    console.log("ws timeout, ajax polling fallback");
                    self.update();
                });

                App.Websocket.on("error", function () {
                    console.log("error");
                });

                App.Websocket.on("register ok", function () {
                    console.log("registered!");
                });

                App.Websocket.on("update queue", function () {
                    console.log("update queue: do update!");
                    self.update();
                });

                App.Websocket.on("change user", function () {
                    console.log("change user: do update!");
                    self.update();
                });

                if (self.usuario.numeroLocal) {
                    self.update();
                }
            },

            update: function () {
                var self = this;
                App.ajax({
                    url: App.url("/novosga.attendance/ajax_update"),
                    success: function (response) {
                        response.data = response.data || {};
                        var estavaVazio = self.atendimentos.length === 0;
                        self.atendimentos = response.data.atendimentos || [];
                        self.usuario = response.data.usuario || {};

                        // habilitando botao chamar
                        if (self.atendimentos.length > 0) {
                            document.title =
                                "(" + self.atendimentos.length + ") " + defaultTitle;
                            if (estavaVazio) {
                                var audio = document.getElementById("alert");
                                if (audio) {
                                    audio.play();
                                }
                                App.Notification.show(
                                    "Atendimento",
                                    "Novo atendimento na fila"
                                );
                            }
                        }
                    },
                });
            },

            infoSenha: function (atendimento) {
                var self = this;
                App.ajax({
                    url: App.url("/novosga.attendance/info_senha/") + atendimento.id,
                    success: function (response) {
                        self.atendimentoInfo = response.data;
                        $("#dialog-senha").modal("show");
                    },
                });
            },

            setLocal: function () {
                var self = this;

                App.ajax({
                    url: App.url("/novosga.attendance/set_local"),
                    type: "post",
                    data: self.novoLocal,
                    success: function (response) {
                        Vue.set(self.usuario, "numeroLocal", response.data.numero.value);
                        self.usuario.tipoAtendimento = response.data.tipo.value;
                        self.novoLocal.numeroLocal = response.data.numero.value;
                        self.novoLocal.tipoAtendimento = response.data.tipo.value;
                        self.atendimentos = [];
                        self.update();
                        $("#dialog-local").modal("hide");
                    },
                });
            },

            chamar: function (e) {
                var self = this;

                if (!e.target.disabled) {
                    e.target.disabled = true;

                    App.ajax({
                        url: App.url("/novosga.attendance/chamar"),
                        type: "post",
                        success: function (response) {
                            self.atendimento = response.data;
                            App.Websocket.emit("call ticket", {
                                unity: unidade.id,
                                service: self.atendimento.servico.id,
                                hash: self.atendimento.hash,
                            });
                        },
                        complete: function () {
                            setTimeout(function () {
                                e.target.disabled = false;
                            }, 5 * 1000);
                        },
                    });
                }
            },

            iniciar: function () {
                var self = this;
                App.ajax({
                    url: App.url("/novosga.attendance/iniciar"),
                    type: "post",
                    success: function (response) {
                        self.atendimento = response.data;
                    },
                });
            },

            naoCompareceu: function () {
                var self = this;

                swal({
                    title: alertTitle,
                    text: alertNaoCompareceu,
                    type: "warning",
                    buttons: [labelNao, labelSim],
                    //dangerMode: true,
                }).then(function (ok) {
                    if (!ok) {
                        return;
                    }

                    App.ajax({
                        url: App.url("/novosga.attendance/nao_compareceu"),
                        type: "post",
                        success: function () {
                            self.atendimento = null;
                        },
                    });
                });
            },

            erroTriagem: function () {
                this.novoUsuario = null;
                this.servicoRedirecionar = null;
                $("#dialog-redirecionar").modal("show");
            },

            preparaEncerrar: function () {
                // Adiciona um ouvinte de eventos de teclado à página
                document.addEventListener("keydown", avaliarAtendimento);
                const mensagemAvaliacao = 'Por favor, solicite a avaliação do atendimento.'
                exibirMensagem(mensagemAvaliacao, 'alerta')
                this.servicosRealizados = [];
                this.servicosUsuario = JSON.parse(JSON.stringify(servicosUsuario));
                if (this.servicosUsuario.length === 1) {
                    var su = this.servicosUsuario[0];
                    if (su.subServicos.length === 0) {
                        this.addServicoRealizado(su.servico);
                    } else if (su.subServicos.length === 1) {
                        this.addServicoRealizado(su.subServicos[0]);
                    }
                }
                this.atendimento.status = "encerrando";
            },

            encerrarVoltar: function () {
                this.atendimento.status = "iniciado";
            },

            fazEncerrar: function (isRedirect) {
                var self = this;

                var servicos = this.servicosRealizados.map(function (servico) {
                    return servico.id;
                });

                if (servicos.length === 0) {
                    $("#dialog-erro-encerrar").modal("show");
                    return;
                }

                var data = {
                    redirecionar: false,
                    servicos: servicos.join(","),
                    resolucao: this.atendimento.resolucao,
                    observacao: this.atendimento.observacao,
                };

                // se foi submetido via modal de redirecionamento
                if (isRedirect) {
                    if (!this.servicoRedirecionar) {
                        $("#dialog-erro-encerrar").modal("show");
                        return;
                    }
                    data.redirecionar = true;
                    data.novoServico = this.servicoRedirecionar;
                    data.novoUsuario = this.novoUsuario;
                } else {
                    if (this.redirecionarAoEncerrar) {
                        this.novoUsuario = null;
                        this.servicoRedirecionar = null;
                        $("#dialog-redirecionar").modal("show");
                        return;
                    }
                }

                swal({
                    title: alertTitle,
                    text: alertEncerrar,
                    type: "warning",
                    buttons: [labelNao, labelSim],
                    //dangerMode: true,
                }).then(function (ok) {
                    if (!ok) {
                        return;
                    }

                    App.ajax({
                        url: App.url("/novosga.attendance/encerrar"),
                        type: "post",
                        data: data,
                        success: function () {
                            self.atendimento = null;
                            self.redirecionarAoEncerrar = false;
                            $(".modal").modal("hide");
                            // remove o ouvinte para não executar sem necessidade
                            removerOuvinteOpnometro();
                        },
                    });
                });
            },

            encerrar: function (isRedirect) {
                this.redirecionarAoEncerrar = false;
                this.fazEncerrar(isRedirect);
            },

            encerrarRedirecionar: function () {
                this.redirecionarAoEncerrar = true;
                this.fazEncerrar(false);
            },

            changeServicoRedirecionar: function () {
                var servico = this.servicoRedirecionar,
                    self = this;

                this.usuarios = [];

                if (servico > 0) {
                    App.ajax({
                        url: App.url(`/novosga.attendance/usuarios/${servico}`),
                        success: function (response) {
                            self.usuarios = response.data;
                        },
                    });
                }
            },

            redirecionar: function () {
                var servico = this.servicoRedirecionar,
                    self = this;

                if (servico > 0) {
                    swal({
                        title: alertTitle,
                        text: alertRedirecionar,
                        type: "warning",
                        buttons: [labelNao, labelSim],
                        //dangerMode: true,
                    }).then(function (ok) {
                        if (!ok) {
                            return;
                        }

                        App.ajax({
                            url: App.url("/novosga.attendance/redirecionar"),
                            type: "post",
                            data: {
                                servico: servico,
                                usuario: self.novoUsuario,
                            },
                            success: function () {
                                self.atendimento = null;
                                $(".modal").modal("hide");
                            },
                        });
                    });
                }
            },

            addServicoRealizado: function (servico) {
                this.servicosRealizados.push(servico);
                servico.disabled = true;
            },

            removeServicoRealizado: function (servico) {
                this.servicosRealizados.splice(
                    this.servicosRealizados.indexOf(servico),
                    1
                );
                servico.disabled = false;
            },

            consultar: function () {
                var self = this;
                App.ajax({
                    url: App.url("/novosga.attendance/consulta_senha"),
                    data: {
                        numero: self.search,
                    },
                    success: function (response) {
                        self.searchResult = response.data;
                    },
                });
            },
        },
    });

    app.init(atendimento);

    if (!local) {
        $("#dialog-local").modal("show");
    }

    // CODIGO PARA OUVIR O OPNOMETRO
    // Função para avaliar o atendimento
    function registraAvaliacao(avaliacao) {
        const dataAtual = new Date();
        const dataFormatada = formatarData(dataAtual);

        var data = {
            data_avaliacao: dataFormatada,
            usuario_avaliado: usuario.login,
            resposta: avaliacao,
            unidade_id: unidade.id,
            num_local: local,
            atendimento_id: null,
            data_gravacao: dataFormatada,
        };

        // Realize a chamada AJAX PARA API
        fetch("../../../api/v1/avaliacao.php", {
            method: "POST",
            body: JSON.stringify(data),
            headers: {
                "Content-Type": "application/json",
            },
        })
            .then(function (response) {
                return response.json(); // Analisa a resposta como JSON
            })
            .then(function (result) {
                switch (result.status_message) {
                    case "Registro incluído com sucesso.":
                        exibirMensagem("ATENDIMENTO AVALIADO COM SUCESSO!", 'sucesso');
                        break;
                    case "Atendimento já avaliado.":
                        exibirMensagem("ATENDIMENTO JÁ AVALIADO!", 'alerta');
                        break;
                    default:
                        break;
                }

            })
            .catch(function (error) {
                // Lida com erros de rede ou outras falhas
                exibirMensagem("ERRO AO AVALIAR O ATENDIMENTO, TENTE NOVAMENTE!", 'erro');
                console.error("Erro:", error);
            });
    }

    const SEQUENCIAS_OPNOMETRO = {
        OTIMO: ["Alt", "1", "4", "2"],
        BOM: ["Alt", "1", "8", "3"],
        REGULAR: ["Alt", "1", "8", "2"],
        RUIM: ["Alt", "1", "4", "3"],
    };

    let sequenciaAtual = [];

    function avaliarAtendimento(event) {
        if (event.altKey) {
            sequenciaAtual.push(event.key);
            if (sequenciaAtual.length > 3) {
                for (const avaliacao in SEQUENCIAS_OPNOMETRO) {
                    const esperado = SEQUENCIAS_OPNOMETRO[avaliacao].join("");
                    const atual = sequenciaAtual.slice(-4).join("");
                    if (esperado === atual) {
                        registraAvaliacao(avaliacao);
                        sequenciaAtual = [];
                        break;
                    }
                }
            }

            return;
        }
        sequenciaAtual = [];

    }

    function formatarData(data) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, "0"); // Os meses são zero-based
        const dia = String(data.getDate()).padStart(2, "0");
        const hora = String(data.getHours()).padStart(2, "0");
        const minuto = String(data.getMinutes()).padStart(2, "0");
        const segundo = String(data.getSeconds()).padStart(2, "0");
        const milissegundo = String(data.getMilliseconds()).padStart(3, "0");

        return `${ano}-${mes}-${dia} ${hora}:${minuto}:${segundo}.${milissegundo}`;
    }

    // REMOVE AO FINALIZAR O ATENDIMENTO
    function removerOuvinteOpnometro() {
        document.removeEventListener("keydown", avaliarAtendimento);
    }

    // previne reload e adiciona a escuta no opinometro
    if (atendimento.dataInicio && !atendimento.dataFim) {
        removerOuvinteOpnometro();
    }

    function exibirMensagem(msg, tipo) {
        var mensagem = document.createElement("div");
        mensagem.textContent = msg;
        mensagem.style.padding = "15px";
        mensagem.style.textAlign = "center";
        mensagem.style.position = "fixed";
        mensagem.style.top = "0";
        mensagem.style.left = "0";
        mensagem.style.right = "0";
        mensagem.style.zIndex = "9999";

        switch (tipo) {
            case "erro":
                mensagem.style.backgroundColor = "#f8d7da";
                mensagem.style.color = "#721c24";
                break;
            case "alerta":
                mensagem.style.backgroundColor = "#fff3cd";
                mensagem.style.color = "#856404";
                break;
            case "sucesso":
                mensagem.style.backgroundColor = "#d4edda";
                mensagem.style.color = "#155724";
                break;
            default:
                mensagem.style.backgroundColor = "#c3e6cb";
                mensagem.style.color = "#155724";
                break;
        }

        document.body.appendChild(mensagem);

        var tempoExibicaoMensagem = 1000 * 3; // 3 segundos

        setTimeout(function () {
            mensagem.style.display = "none";
        }, tempoExibicaoMensagem);
    }
})();

