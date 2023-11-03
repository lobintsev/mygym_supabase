const axios = require('axios');
const crypto = require('crypto');
const signRequest = require('./signRequest');

async function initPayment(notificationURL, terminalKey, amount, orderId, merchantPassword, customerKey) {
  // Создаем тело запроса для токена
  const requestBody = {
    TerminalKey: terminalKey,
    Amount: amount,
    OrderId: orderId,
    NotificationURL: notificationURL,
    CustomerKey: customerKey,
    DATA: { telegram_id: 12345 }
  };
console.log(requestBody);
  // Генерируем токен
  const token = signRequest(requestBody, merchantPassword)
  console.log(token);
  requestBody.Token = token;

 

  try {
    // Логируем непосредственно перед отправкой запроса
    console.log("Sending payment initialization request with body:", requestBody);
  
    // Отправляем запрос на инициализацию платежа
    const response = await axios.post('https://securepay.tinkoff.ru/v2/Init', requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  
    // Логируем ответ сервера
    console.log("Payment initialized:", response.data);
  
    return response.data;
  } catch (error) {
    // Логируем ошибку, если таковая произошла
    console.error("Error initializing payment:", error.response ? error.response.data : error.message);
    throw error;
  }
}

// Пример использования функции
const terminalKey = '1694006554663DEMO';
const amount = 140000; // В копейках
const orderId = '21053';
const merchantPassword = 'rns5jl8e89domk5c'; // Пароль мерчанта
const notificationURL = 'https://httpdump.app/dumps/d56b5c56-0a17-4867-b909-0e5ee8c9047a';
const customerKey = '12345'

module.exports = initPayment;