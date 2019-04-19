const express = require('express');
const admin = require('./admin');
const customer = require('./customer');
const payment = require('../payment');
// const shoppingCarts = require('../shoppingCart');
const bodyParser = require('body-parser');

var router = express.Router();

var bodyParserInstance = bodyParser.json({ limit: '10mb' });

router.route('/').get(customer.getLandingPage);
router.use(express.static('public'));

router.route('/admin/dashboard').get(admin.getDashboard);
router.route('/admin/products').get(admin.getProducts);
router.route('/admin/orders').get(admin.getOrders);
router.route('/admin/shoppingCarts').get(admin.getProducts);
router.route('/admin/stats').get(admin.getStats);
router.route('/admin/order/fulfillment/invert').put(bodyParserInstance, admin.invertIsFulfilled);

router.route('/customer/shoppingCart/process').post(bodyParserInstance, payment.processPayment);
router.route('/customer/shoppingCart').post(bodyParserInstance, customer.postShoppingCart);
router.route('/customer/shoppingCart').get(customer.getShoppingCart);
router.route('/customer/shoppingCart/view').get(customer.getShoppingCartView);
router.route('/customer/shoppingCart').delete(bodyParserInstance, customer.removeShoppingCart);
router.route('/customer/thankyou').get(customer.thankyou);

router.route('/products/home').get(function(req, res){
   var params
   return res.render("customer/home.ejs", params)
},);
router.route('/products/category/:category').get(customer.getProductsForCategory);
router.route('/products/search').get(customer.queryProducts);
router.route('/products/:productId/:mode').get(customer.getProduct);

module.exports = router;
