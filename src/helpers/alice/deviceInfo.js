const dotenv = require('dotenv');
const axios = require('axios')
dotenv.config();

function deviceInfo(deviceId) {
  const url = 'https://api.iot.yandex.net/v1.0/devices/' + deviceId;
  const token = process.env.ALICE_IOT_TOKEN; // Загрузка токена из .env файла


  return axios.get(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  })
  .then(response => {
    console.log(response);
    return response; // Возвращаем данные для дальнейшей обработки
  })
  .catch(error => {
    console.error('An error occurred:', error);
    throw error; // Перебрасываем ошибку для дальнейшей обработки
  });
}

module.exports = deviceInfo