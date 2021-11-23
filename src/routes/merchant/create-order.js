const axios = require('axios');

exports.route = (app) => {
  app.post('/merchant/create_order', async (req, res) => {
    try {
      const config = {
        headers: { Authorization: `Basic ${process.env.PRINTFUL_API}` },
      };
      const response = await axios.post('https://api.printful.com/orders', req.body, config);

      return res.status(200)
        .json(response.data);
    } catch (err) {
      return res.status(500)
        .json({ message: err });
    }
  });
};
