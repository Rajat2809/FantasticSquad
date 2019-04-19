const db = require("../db");
const stripeFactory = require('stripe');//('sk_test_iVPnpKXLR9EvYdC74iQZNlAO');
const SECRET_KEY = "sk_test_LXdcKl7hCbf0dwoYaXOY5LMj"; 

function initStripe(auth){
    return stripeFactory(auth)
}

function charge_(stripe, params, cb){
    var params = {
        amount: params.amount,
        currency: params.currency,
        source: params.token.id,
    }

    stripe.charges.create(params, cb)
}


module.exports.processPayment = function(request, response){
    console.log("request: " + JSON.stringify(request.body))
    var input = request.body;

    db.ShoppingCart.findAll({
        where: {
            id: input.shoppingCartId
        }
    }).then(function(shoppingCarts){
        if (shoppingCarts.length == 0){
            return response.status(400).send({
                error: "INVALID_SHOPPING_CART_ID"
            })
        }

        var shoppingCart = shoppingCarts[0];
        var paymentInfo = {
            token: input.token,
            args: input.args
        }

        var paymentData = shoppingCarts.paymentData ? JSON.parse(JSON.stringify(shoppingCarts.paymentData)): []

        charge_(initStripe(SECRET_KEY), input, function(err, charge){
            if (err){
                paymentInfo.result = {
                    status: "failed",
                    error: err
                }
            }
            else {
                paymentInfo.result = charge;
            }
            
            paymentData.unshift(paymentInfo)
            shoppingCart.updateAttributes({
                paymentData: paymentData,
                isActive: charge.status != "succeeded",
                isPaid: charge.status == "succeeded"
            }).then(function(shoppingCart){
                return response.send(shoppingCart)
            })
        })
    })
}