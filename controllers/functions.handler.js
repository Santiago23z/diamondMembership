const TelegramBot = require('node-telegram-bot-api');
const WooCommerceAPI = require('woocommerce-api');
const mongoose = require('mongoose');
const UsedEmail = require('../models/UsedEmail');

const token = "6525885535:AAFBxlJUnXVfOCsM0WCS9Af5djotpbk3evs";
const bot = new TelegramBot(token, { polling: true });

const WooCommerce = new WooCommerceAPI({
  url: 'https://www.sharpods.com/',
  consumerKey: "ck_f02ace259e6b96e2c395cdb46e4c709700279213",
  consumerSecret: "cs_f22ccf75d96e375ecec1fea0ef6b133ad8f95840",
  wpAPI: true,
  version: 'wc/v3',
  queryStringAuth: true
});

const channels = [
  { id: '-1002007887417', name: 'Sharpods Club 💎 💎' },
  { id: '-1001679093288', name: 'Bot de goles Bet Live 💎' },
  { id: '-1001538116034', name: 'Bot de itinerarios Bet Live 💎' },
  { id: '-1001587405522', name: 'Bot de corners Bet Live' }
];

let emailSubscriptions = null; 
let emailSubscriptionsLastFetched = 0; 
let userFetchingStatus = {}; 
let userLastActivity = {}; 

const getDiamondBlackMembershipEmails = async () => {
  try {
    console.log('Fetching DiamondBlack membership emails...');
    const now = Date.now();
    const cacheDuration = 24 * 60 * 60 * 1000; 

    if (emailSubscriptions && (now - emailSubscriptionsLastFetched) < cacheDuration) {
      console.log('Using cached email subscriptions');
      return emailSubscriptions;
    }

    const initialResponse = await WooCommerce.getAsync("memberships/members?plan=diamond&page=1");
    const initialResponseBody = initialResponse.toJSON().body;
    const initialData = JSON.parse(initialResponseBody);

    if (!Array.isArray(initialData)) {
      throw new Error('Unexpected response format');
    }

    let totalPages = 1;
    if (initialResponse.headers['x-wp-totalpages']) {
      totalPages = parseInt(initialResponse.headers['x-wp-totalpages']);
    }

    const pagePromises = [];
    for (let page = 1; page <= totalPages; page++) {
      pagePromises.push(WooCommerce.getAsync(`memberships/members?plan=diamond&page=${page}`));
    }

    const pageResponses = await Promise.all(pagePromises);
    const allMembers = pageResponses.flatMap(pageResponse => {
      const pageBody = pageResponse.toJSON().body;
      return JSON.parse(pageBody);
    });

    const DiamondBlackEmails = await Promise.all(allMembers.map(async (member) => {
      try {
        const customerResponse = await WooCommerce.getAsync(`customers/${member.customer_id}`);
        const customerResponseBody = customerResponse.toJSON().body;

        if (customerResponse.headers['content-type'].includes('application/json')) {
          const customerData = JSON.parse(customerResponseBody);
          if (member.status === 'active') {
            return customerData.email.toLowerCase();
          }
        } else {
          return null;
        }
      } catch (error) {
        console.error(`Error fetching customer data for member ${member.customer_id}:`, error);
        return null;
      }
    }));

    const validEmails = DiamondBlackEmails.filter(email => email !== null);

    emailSubscriptions = validEmails;
    emailSubscriptionsLastFetched = now;

    return validEmails;
  } catch (error) {
    console.error('Error al obtener los correos de membresía DiamondBlack:', error);
    return [];
  }
};

const verifyAndSaveEmail = async (chatId, email, bot) => {
  try {
    if (await isEmailUsed(email)) {
      await bot.sendMessage(chatId, `El correo ${email} ya ha sido utilizado.`);
      return;
    }

    console.log('Lista de correos obtenida:', emailSubscriptions);
    const hasDiamondBlackMembership = emailSubscriptions.includes(email.toLowerCase());
    console.log('Correo verificado:', email.toLowerCase(), 'Resultado:', hasDiamondBlackMembership);

    if (!hasDiamondBlackMembership) {
      await bot.sendMessage(chatId, 'No tienes una suscripción actualmente activa con la membresía "DiamondBlack".');
      return;
    }

    const inviteLinks = await Promise.all(channels.map(async (channel) => {
      const link = await createInviteLink(channel.id);
      return { text: channel.name, url: link || 'https://example.com/invalid-link' };
    }));

    const buttonsLinks = {
      inline_keyboard: inviteLinks.map(link => [{ text: link.text, url: link.url }])
    };

    const options = {
      reply_markup: JSON.stringify(buttonsLinks),
    };
    const message = '¡Ey parcerooo! Te doy una bienvenida a nuestro club premium: ¡Sharpods Club! Espero que juntos podamos alcanzar grandes victorias. ¡Mucha, mucha suerte, papi!';
    await bot.sendMessage(chatId, message, options);

    await saveUsedEmail(email);
  } catch (error) {
    console.error(`Error verifying email for ${chatId}:`, error);
    await bot.sendMessage(chatId, 'Ocurrió un error al verificar el correo. Inténtalo de nuevo más tarde.');
  }
};

const saveUsedEmail = async (email) => {
  try {
    const usedEmail = new UsedEmail({ email });
    await usedEmail.save();
  } catch (error) {
    console.error(`Error saving used email: ${error}`);
  }
};

const isEmailUsed = async (email) => {
  try {
    const emailDoc = await UsedEmail.findOne({ email });
    return !!emailDoc;
  } catch (error) {
    console.error(`Error finding used email: ${error}`);
    return false;
  }
};

const createInviteLink = async (channelId) => {
  try {
    const inviteLink = await bot.createChatInviteLink(channelId, {
      member_limit: 1, 
    });
    return inviteLink.invite_link;
  } catch (error) {
    console.error('Error al crear el enlace de invitación:', error);
    return null;
  }
};

const WelcomeUser = () => {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.chat.type !== 'private') {
      console.log('Mensaje ignorado de grupo o canal');
      return;
    }

    if (!msg.text) {
      await bot.sendMessage(chatId, 'Por favor envía un correo electrónico válido.');
      return;
    }

    const text = msg.text.trim().toLowerCase();

    const now = Date.now();
    const lastActivity = userLastActivity[chatId] || 0;
    const inactivityTime = now - lastActivity;
    const maxInactivityTime = 2 * 60 * 1000; // 2 minutos en milisegundos

    if (inactivityTime > maxInactivityTime) {
      userFetchingStatus[chatId] = false;
    }

    userLastActivity[chatId] = now;

    if (userFetchingStatus[chatId]) {
      await bot.sendMessage(chatId, 'Por favor espera a que se obtengan las suscripciones activas.');
      return;
    }

    if (!emailSubscriptions || emailSubscriptions.length === 0) {
      userFetchingStatus[chatId] = true;

      try {
        await bot.sendMessage(chatId, 'Obteniendo correos con membresía "DiamondBlack", por favor espera. Podría tardar al menos un minuto.');
        const DiamondBlackEmails = await getDiamondBlackMembershipEmails();

        emailSubscriptions = DiamondBlackEmails;
        userFetchingStatus[chatId] = false;
        await bot.sendMessage(chatId, 'Escribe el correo con el que compraste en Sharpods.');
      } catch (err) {
        userFetchingStatus[chatId] = false;
        console.error(`Error fetching emails for chatId ${chatId}:`, err);
        await bot.sendMessage(chatId, 'Ocurrió un error al obtener los correos con membresía "DiamondBlack". Vuelve a intentar escribiéndome.');
      }
    } else {
      try {
        await verifyAndSaveEmail(chatId, text, bot);
      } catch (error) {
        console.error(`Error verifying email for ${chatId}:`, error);
        await bot.sendMessage(chatId, 'Ocurrió un error al verificar el correo. Inténtalo de nuevo más tarde.');
      }
    }
  });
};

const UnbanChatMember = (userId) => {
  for (const channel of channels) {
    bot.unbanChatMember(channel.id, userId)
      .then(() => {
        console.log(`User unbanned from the channel ${channel.name}`);
      })
      .catch(err => console.log(`Error to unban user ${err}`));
  }
};

const KickChatMember = (userId) => {
  for (const channel of channels) {
    bot.banChatMember(channel.id, userId)
      .then(() => {
        console.log(`User kicked from the channel ${channel.name}`);
      })
      .catch(err => console.log(`Error to kick user ${err}`));
  }
};

module.exports = {
  WelcomeUser,
  UnbanChatMember,
  KickChatMember
};
