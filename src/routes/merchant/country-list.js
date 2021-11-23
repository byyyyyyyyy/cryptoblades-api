const axios = require('axios');

exports.route = (app) => {
  app.get('/merchant/countries', async (req, res) => {
    try {
      const config = {
        headers: { Authorization: `Basic ${process.env.PRINTFUL_API}` },
      };
      const response = await axios.get('https://api.printful.com/countries', config);

      return res.status(200)
        .json(response.data);
    } catch (err) {
      return res.status(500)
        .json({ message: err });
    }
  });
};
