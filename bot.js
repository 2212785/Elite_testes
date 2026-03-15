const wppconnect = require('@wppconnect-team/wppconnect');
const { initializeApp } = require("firebase/app");
// ADICIONEI "update" NA LINHA ABAIXO
const { getDatabase, ref, onValue, get, update } = require("firebase/database"); 

// 1. CONFIGURAÇÃO FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyANz1gbAi3PIGwS1-RzOIXF6SUZvS2U0mU",
    databaseURL: "https://agenda-album-de-formatura-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const projId = "guaratingueta-guilherme";

let prontoParaEnviar = false;
let idsProcessados = new Set();

// 2. INICIAR BOT (Navegador visível para evitar suspensão do Windows)
wppconnect.create({
    session: 'bot-formatura',
    autoClose: 0,
    puppeteerOptions: {
        headless: false, 
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    logQR: true,
    catchQR: (base64Qr, asciiQR) => {
        console.clear();
        console.log(asciiQR);
    }
})
.then((client) => start(client))
.catch((err) => console.error("ERRO AO INICIAR:", err));

// 3. LÓGICA DE INTERAÇÃO
async function start(client) {
    // --- SINALIZAÇÃO DO LED VERDE ---
    // Como já importamos lá no topo, não precisa do 'require' aqui dentro
    update(ref(db, `projetos/${projId}/bot`), {
        status: 'Online',
        ultima_atividade: Date.now()
    });

    // Configura para avisar que está offline ao fechar o terminal
    process.on('SIGINT', async () => {
        await update(ref(db, `projetos/${projId}/bot`), { status: 'Offline' });
        process.exit();
    });

    console.log("========================================");
    console.log("   ELITE BOT MASTER v37.10 ATIVO 🚀     ");
    console.log("========================================");
    
    const agRef = ref(db, `dados/${projId}/agendamentos`);

    // --- ESCUTA WHATSAPP (ENTRADA DE MENSAGENS DOS PAIS) ---
    client.onMessage(async (message) => {
        console.log(`[RECEBIDO] De: ${message.from} | Texto: ${message.body}`);

        if (message.isGroupMsg || message.fromMe || message.from === 'status@broadcast') return;

        const textoOriginal = (message.body || "").toLowerCase().trim();
        const textoLimpo = textoOriginal.replace(/[.,!?;]/g, "").trim();

        if (!textoLimpo) return;

        if (
            textoLimpo === "sim" || 
            textoLimpo.startsWith("sim ") || 
            textoLimpo.includes("sou eu") || 
            textoLimpo.includes("é ele") || 
            textoLimpo.includes("é ela") ||
            textoLimpo.includes("pode falar")
        ) {
            console.log("-> Cliente confirmou! Sorteando mensagem...");

            const mensagens = [
                "As recordações da formatura do seu filho(a) já estão prontas para entrega! Levamos o material até sua residência em um horário pré-agendado, sem qualquer compromisso de compra.\n\n⚠️ RESERVE SEU HORÁRIO PARA HOJE AQUI:\n👉 https://2212785.github.io/Agendamentos",
                "Já iniciamos as entregas das fotos de formatura do seu filho(a). Para sua total facilidade, realizamos uma visita em sua casa com hora marcada e sem compromisso.\n\n⚠️ GARANTA SUA VAGA NA AGENDA DE HOJE:\n👉 https://2212785.github.io/Agendamentos",
                "Chegou a hora de conferir as lembranças da formatura do seu filho(a). Agende uma visita em seu domicílio para conhecer o material; a apresentação é gratuita e sem compromisso.\n\n⚠️ ESCOLHA SEU PERÍODO PARA HOJE PELO LINK:\n👉 https://2212785.github.io/Agendamentos",
                "Informamos que as fotos de formatura do seu filho(a) já estão disponíveis para entrega domiciliar. A visita é agendada conforme sua disponibilidade e não gera obrigatoriedade de compra.\n\n⚠️ AGENDE SUA VISITA PARA HOJE POR AQUI:\n👉 https://2212785.github.io/Agendamentos",
                "Estamos organizando as visitas para a entrega das fotos de formatura do seu filho(a). O atendimento é personalizado, feito na sua casa e com horário marcado para sua segurança e conforto.\n\n⚠️ CLIQUE PARA AGENDAR SEU HORÁRIO HOJE:\n👉 https://2212785.github.io/Agendamentos",
                "Atenção: as fotos de formatura do seu filho(a) já podem ser entregues. Agende uma visita sem compromisso em sua residência para visualizar o material completo.\n\n⚠️ ACESSE O LINK E MARQUE PARA HOJE:\n👉 https://2212785.github.io/Agendamentos"
            ];

            const sorteio = Math.floor(Math.random() * mensagens.length);
            
            try {
                await client.startTyping(message.from);
                await new Promise(r => setTimeout(r, 1500));
                await client.sendText(message.from, mensagens[sorteio]);
                await client.stopTyping(message.from);
                console.log(`[OK] Resposta aleatória enviada (Opção ${sorteio + 1})`);
            } catch (err) {
                console.log("Erro no envio:", err);
            }
        }

        else if (textoLimpo.includes("horario") || textoLimpo.includes("horário")) {
            console.log("-> Buscando agendamento no banco...");
            const foneCliente = message.from.replace("@c.us", "").replace(/\D/g, "");
            const snapshot = await get(agRef);
            
            if (snapshot.exists()) {
                let achou = false;
                const dados = snapshot.val();
                for (let diaKey in dados) {
                    for (let id in dados[diaKey]) {
                        const ag = dados[diaKey][id];
                        const foneBanco = (ag.telefone || "").replace(/\D/g, "");
                        
                        if (foneBanco !== "" && (foneBanco.includes(foneCliente) || foneCliente.includes(foneBanco))) {
                            achou = true;
                            let dataFinal = ag.data || diaKey;
                            if(dataFinal.includes("-")){
                                const p = dataFinal.split("-");
                                dataFinal = `${p[2]}/${p[1]}/${p[0]}`;
                            }

                            await client.sendText(message.from, `✅ Localizei seu agendamento!\n\n🎓 Formando: ${ag.nome_formando}\n📅 Data: ${dataFinal}\n⏰ Hora: ${ag.horario}`);
                            console.log(`[OK] Horário enviado para ${ag.nome_formando}`);
                        }
                    }
                }
                if (!achou) await client.sendText(message.from, "Ainda não encontrei um agendamento para este número. 🧐");
            }
        }
    });

    onValue(agRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const dadosGerais = snapshot.val();

        Object.keys(dadosGerais).forEach(dataKey => {
            const agendamentosDoDia = dadosGerais[dataKey];
            Object.keys(agendamentosDoDia).forEach(agKey => {
                const ag = agendamentosDoDia[agKey];
                
                if (prontoParaEnviar && ag.resultado === "Pendente" && !idsProcessados.has(agKey)) {
                    idsProcessados.add(agKey);
                    const fone = (ag.telefone || "").replace(/\D/g, "");
                    
                    if (fone) {
                        let dF = ag.data || dataKey;
                        if(dF.includes("-")){
                            const p = dF.split("-");
                            dF = `${p[2]}/${p[1]}/${p[0]}`;
                        }

                        const msg = `Olá ${ag.nome_formando}! 🎓\n\nSua visita foi registrada com sucesso!\n\n📅 Data: ${dF}\n⏰ Hora: ${ag.horario}\n\nAté breve! 👍`;
                        
                        client.sendText(`55${fone}@c.us`, msg)
                        .then(() => console.log(`[CONFIRMAÇÃO] Enviada para ${ag.nome_formando}`))
                        .catch(e => console.log(`[ERRO CONFIRMAÇÃO] ${ag.nome_formando}`));
                    }
                } else {
                    idsProcessados.add(agKey);
                }
            });
        });
    });

    setTimeout(() => { 
        prontoParaEnviar = true; 
        console.log(">> MONITORAMENTO ATIVO 🚀"); 
    }, 5000);
}