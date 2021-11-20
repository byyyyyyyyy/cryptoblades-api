const axios = require('axios');

exports.route = (app) => {
  app.post('/merchant/create_order', async (req, res) => {
    try {
      const response = await axios({
        method: 'post',
        url: 'https://api.printful.com/orders',
        headers: { Authorization: `Basic ${process.env.PRINTFUL_API}` },
      }, req.body);

      return res.status(200).json(response.data);
    } catch (err) {
      return res.status(500).json({ message: err });
    }
  });
};
