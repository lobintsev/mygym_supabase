const dotenv = require('dotenv');
const axios = require('axios')
dotenv.config();

function toggleDevice(deviceId, value) {
  const url = 'https://api.iot.yandex.net/v1.0/devices/actions';
  const token = process.env.ALICE_IOT_TOKEN; // Загрузка токена из .env файла

  const body = {
    devices: [{
      id: deviceId,
      actions: [{
        type: "devices.capabilities.on_off",
        state: {
          instance: "on",
          value: value
        }
      }]
    }]
  };

  return axios.post(url, body, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  })
  .then(response => {
    console.log(response.data);
    return response.data; // Возвращаем данные для дальнейшей обработки
  })
  .catch(error => {
    console.error('An error occurred:', error);
    throw error; // Перебрасываем ошибку для дальнейшей обработки
  });
}

module.exports = toggleDevice