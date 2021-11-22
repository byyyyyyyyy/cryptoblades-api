const axios = require('axios');

exports.route = (app) => {
  app.get('/merchant/products/:id', async (req, res) => {
    try {
      const response = await axios({
        method: 'get',
        url: `https://api.printful.com/store/products/${req.params.id}`,
        headers: { Authorization: `Basic ${process.env.PRINTFUL_API}` },
      });

      return res.status(200).json(response.data);
    } catch (err) {
      return res.status(500).json({ message: err });
    }
  });
};
