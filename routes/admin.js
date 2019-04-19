const products = require("../product");
const shoppingCarts = require("../shoppingCart");

module.exports = {
   getDashboard : function(req, res){
      var params
      return res.render("admin/dashboard.ejs", params)
   },
   getStats: shoppingCarts.getStats,
   getProducts : products.getProducts,
   getOrders : shoppingCarts.getShoppingCarts,
   getShoppingCarts: shoppingCarts.getShoppingCarts,
   invertIsFulfilled: shoppingCarts.invertIsFulfilled,
   getProductView : function(req, res){
      //do something
      return res.send("getProductView is called")
   }
}