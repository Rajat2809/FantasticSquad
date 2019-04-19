const products = require("../product");
const shoppingCarts = require("../shoppingCart");

module.exports = {
    getProduct: products.getProduct,
    getShoppingCart: shoppingCarts.getShoppingCart,
    getShoppingCartView: shoppingCarts.getShoppingCartView,
    postShoppingCart: shoppingCarts.addToCart,
    removeShoppingCart: shoppingCarts.removeFromCart,
    getProductsForCategory: products.getProductsForCategory,
    queryProducts: products.queryProducts,
    processPayment: shoppingCarts.processPayment,
    thankyou: shoppingCarts.getPostPurchaseView,
    getLandingPage: getLandingPage,
    getLanding: function(req, res){
        var params
        return res.render("customer/home.ejs", params)
     }
}

function getLandingPage(request, response){
    return response.render("./customer/landingPage.ejs", {})
}