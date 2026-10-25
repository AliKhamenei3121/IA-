
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
 
// ---------------------------------------------------------------------------
// Config (TODO viene de variables de entorno, nunca hardcodeado en el código)
// ---------------------------------------------------------------------------
const TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PORT = process.env.PORT || 3000;
 
if (!TOKEN) {
    console.error('❌ Falta la variable de entorno TELEGRAM_TOKEN');
    process.exit(1);
}
if (!GROQ_API_KEY) {
    console.error('❌ Falta la variable de entorno GROQ_API_KEY');
    process.exit(1);
}
 
// ---------------------------------------------------------------------------
// Servidor web mínimo (muchos hosts gratuitos exigen que algo escuche en PORT)
// ---------------------------------------------------------------------------
const app = express();
app.get('/', (req, res) => res.send('Bot online ✅'));
app.listen(PORT, () => console.log(`Servidor HTTP escuchando en el puerto ${PORT}`));
 
// ---------------------------------------------------------------------------
// Bot de Telegram
// ---------------------------------------------------------------------------
const bot = new TelegramBot(TOKEN, { polling: true });
 
bot.on('polling_error', (err) => {
    // Esto es justo lo que te está fallando: aquí verás la causa real
    console.error('⚠️ Error de polling:', err.code, err.message);
});
 
const PERSONALIDADES = {
    amigable: 'Eres un asistente amigable y cercano. Responde con calidez, claridad y algo de humor ligero.',
    formal: 'Eres un asistente profesional y formal. Responde con precisión y un tono corporativo.',
    tutor: 'Eres un tutor paciente que explica temas de programación y tecnología paso a paso, con ejemplos.'
};
 
const personalidadPorChat = new Map();
 
async function consultarGroq(mensajeUsuario, personalidad) {
    const systemPrompt = PERSONALIDADES[personalidad] || PERSONALIDADES.amigable;
    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.1-8b-instant', // revisa en console.groq.com/docs/models los modelos vigentes
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: mensajeUsuario }
                ],
                temperature: 0.7,
                max_tokens: 600
            },
            {
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        // Logueamos el detalle real del error para poder diagnosticar
        if (error.response) {
            console.error('❌ Groq respondió con error:', error.response.status, error.response.data);
        } else {
            console.error('❌ Error de red/timeout llamando a Groq:', error.message);
        }
        return null;
    }
}
 
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const texto = msg.text;
    if (!texto) return;
 
    if (texto === '/start') {
        bot.sendMessage(chatId,
            '👋 ¡Hola! Soy tu asistente conectado a IA.\n\n' +
            'Comandos disponibles:\n' +
            '/modo amigable|formal|tutor - Cambiar personalidad\n' +
            '/ayuda - Ver este mensaje'
        );
        personalidadPorChat.set(chatId, 'amigable');
        return;
    }
 
    if (texto === '/ayuda') {
        bot.sendMessage(chatId, 'Escríbeme lo que necesites y te responderé usando IA. Usa /modo para cambiar de personalidad.');
        return;
    }
 
    if (texto.startsWith('/modo')) {
        const nuevoModo = texto.replace('/modo', '').trim().toLowerCase();
        if (PERSONALIDADES[nuevoModo]) {
            personalidadPorChat.set(chatId, nuevoModo);
            bot.sendMessage(chatId, `✅ Personalidad cambiada a: ${nuevoModo}`);
        } else {
            bot.sendMessage(chatId, `❌ Modo no válido. Opciones: ${Object.keys(PERSONALIDADES).join(', ')}`);
        }
        return;
    }
 
    bot.sendChatAction(chatId, 'typing');
    const personalidad = personalidadPorChat.get(chatId) || 'amigable';
    const respuesta = await consultarGroq(texto, personalidad);
 
    if (!respuesta) {
        bot.sendMessage(chatId, '⚠️ Hubo un problema consultando la IA. Intenta de nuevo en un momento.');
        return;
    }
 
    bot.sendMessage(chatId, respuesta);
});
 
console.log('🤖 Bot iniciado, esperando mensajes...');
 
