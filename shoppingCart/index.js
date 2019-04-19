const db = require("../db");
const _ = require("lodash");
const moment = require("moment");;

module.exports.getShoppingCart = function(request, response){
    var sessionToken = request.sessionID;
    
    db.ShoppingCart.findOrCreate({
        where: {
            isActive: true,
            isPaid: false,
            sessionToken: sessionToken
        },
        defaults: {
            items: [],
            price: {
                itemPrice: 0,
                tax: 0,
                total: 0
            },
            deviceInfo: getDeviceInfo(request),
            locale: "en_us"
        }
    }).spread(function(shoppingCart){
        return response.send({
            shoppingCart: shoppingCart
        })
    })
}

module.exports.getShoppingCartView = function(request, response){
    var sessionToken = request.sessionID;
    
    db.ShoppingCart.findOrCreate({
        where: {
            isActive: true,
            isPaid: false,
            sessionToken: sessionToken
        },
        defaults: {
            items: [],
            price: {
                itemPrice: 0,
                tax: 0,
                total: 0
            },
            deviceInfo: getDeviceInfo(request),
            locale: "en_us"
        }
    }).spread(function(shoppingCart){
        return response.render("./customer/shoppingCart.ejs", {
            shoppingCart: shoppingCart
        })
    })
}

module.exports.addToCart = function(request, response){ 
    var sessionToken = request.sessionID;
    var skuId = request.body.skuId;
    var quantity = request.body.quantity;
    console.log("payload: " + JSON.stringify(request.body, null,4))

    if (isNaN(quantity)){
        quantity = 1;
    }
    else {
        quantity = Number(quantity)
    }
    

    db.ShoppingCart.findOrCreate({
        where: {
            isActive: true,
            isPaid: false,
            sessionToken: sessionToken
        },
        defaults: {
            items: [],
            price: {
                itemPrice: 0,
                tax: 0,
                total: 0
            },
            deviceInfo: getDeviceInfo(request),
            locale: "en_us"
        }
    }).spread(function(shoppingCart){
        db.Sku.findAll({
            where: {
                id: skuId
            },
            include: [{
                model: db.Product
            }]
        }).then(function(skus){
            if (skus.length == 0){
                return response.status(400).send({
                    error: "INVALID_SKU_ID"
                })
            }

            var items = JSON.parse(JSON.stringify(shoppingCart.items))
            var sku = JSON.parse(JSON.stringify(skus[0]));

            var foundId = items.findIndex(function(ite){
                return ite.id == sku.id
            })

            if (foundId > -1){
                items[foundId].quantity += quantity;
                if (items[foundId].quantity <= 0){
                    _.remove(items, function (el) {
                        return items[foundId].quantity <= 0;
                    });
                }         
            }
            else if (quantity > 0){
                delete sku.inventory;
                sku.quantity = quantity;
                items.push(sku)
            }
            else {
                return response.status(400).send({
                    error: "INVALID_QUANTITY"
                })
            }

            var price = {
                total: 0,
                tax: 0,
                itemPrice: 0
            }

            items.map(function(item){
                price.itemPrice += item.price * item.quantity
            })

            const TAX_PERCENTAGE = 0.1;

            price.tax = price.itemPrice * TAX_PERCENTAGE;
            price.total = price.itemPrice + price.tax;

            shoppingCart.updateAttributes({
                items: items,
                price: price
            }).then(function(shoppingCart){
                return response.send({
                    success: true,
                    shoppingCart: shoppingCart
                })
            })
        })
    })
}

module.exports.removeFromCart = function(request, response){ 
    var sessionToken = request.sessionID;
    var skuId = request.body.skuId;
    console.log("payload: " + JSON.stringify(request.body, null,4))

    db.ShoppingCart.findOrCreate({
        where: {
            isActive: true,
            isPaid: false,
            sessionToken: sessionToken
        },
        defaults: {
            items: [],
            price: {
                itemPrice: 0,
                tax: 0,
                total: 0
            },
            deviceInfo: getDeviceInfo(request),
            locale: "en_us"
        }
    }).spread(function(shoppingCart){
        db.Sku.findAll({
            where: {
                id: skuId
            },
            include: [{
                model: db.Product
            }]
        }).then(function(skus){
            if (skus.length == 0){
                return response.status(400).send({
                    error: "INVALID_SKU_ID"
                })
            }

            var items = JSON.parse(JSON.stringify(shoppingCart.items))
            var sku = JSON.parse(JSON.stringify(skus[0]));

            var foundId = items.findIndex(function(ite){
                return ite.id == sku.id
            })

            if (foundId > -1){
                _.remove(items, function (el) {
                    return el.id == items[foundId].id;
                });      
            }

            var price = {
                total: 0,
                tax: 0,
                itemPrice: 0
            }

            items.map(function(item){
                price.itemPrice += item.price
            })

            const TAX_PERCENTAGE = 0.1;

            price.tax = price.itemPrice * TAX_PERCENTAGE;
            price.total = price.itemPrice + price.tax;

            shoppingCart.updateAttributes({
                items: items,
                price: price
            }).then(function(shoppingCart){
                return response.send({
                    success: true,
                    shoppingCart: shoppingCart
                })
            })
        })
    })
}

module.exports.invertIsFulfilled = function(request, response){ 
    db.ShoppingCart.findAll({
        where: {
            id: request.body.shoppingCartId
        },
    }).then(function(shoppingCarts){
        if (shoppingCarts.length == 0){
            return response.status(400).send({
                error: "INVALID_SHOPPING_CART_ID"
            })
        }
        var shoppingCart = shoppingCarts[0];
        shoppingCart.updateAttributes({
            isFulfilled : !shoppingCarts.isFulfilled
        }).then(function(shoppingCart){
            return response.send({
                success: true,
            })
        })
    })
}

module.exports.getShoppingCarts = function(request, response){
    var input = request.query;
    var limit = input.limit ? Number(input.limit) : 20
    var offset = input.offset ? Number(input.offset) : 0
    
    var query = {
        limit: limit + 1,
        offset: offset,
        where: {
            isPaid: true
        }
    }

    var queryString = input.q ? _.trim(input.q) : null;
    if (!queryString || queryString == ""){
        query.where.id = { $ne: 0 };
    }
    else if (!isNaN(queryString)){
        query.where.id = Number(queryString);
    }


    db.ShoppingCart.findAll(query).then(function(shoppingCarts){
        var pagination = {}
        if (shoppingCarts.length > limit){
            pagination.next = {
                q: input.q, 
                limit: limit,
                offset: offset + limit
            }
        }

        if (offset > 0){
            pagination.previous = {
                q: input.q,
                limit: limit,
                offset: offset - limit
            }
        }

        return response.send({
            limit: limit, 
            offset: shoppingCarts.length > limit ? (offset + limit) : -1,
            data: shoppingCarts.slice(0, limit),
            pagination: pagination
        })
    })
}

module.exports.getStats = function(request, response){
    db.ShoppingCart.findAll({}).then(function(shoppingCarts){
        var result = {
            totalSale: 0,
            tax: 0,
            itemSold: 0,
            totalItems: 0,
            orderToFulfill: 0,
            charts: {
                devices: [],
                locales: [],
            }
        }

        var devices = {};
        var locales = {};

        var saleMap = {};
        var saleCountMap = {};

        shoppingCarts.map(function(shoppingCart){
            // Get sale stats
            if (shoppingCart.isPaid){
                result.totalSale += shoppingCart.price.itemPrice;
                result.tax += shoppingCart.price.tax;
                result.itemSold += shoppingCart.items.length;
                if (!shoppingCart.isFulfilled){
                    result.orderToFulfill += 1;
                }

                saleMap[moment(shoppingCart.updatedAt).utc().format("MM-DD-YYYY")] = shoppingCart.price.itemPrice;
                saleCountMap[moment(shoppingCart.updatedAt).utc().format("MM-DD-YYYY")] = saleCountMap[moment(shoppingCart.updatedAt).utc().format("MM-DD-YYYY")] ? (saleCountMap[moment(shoppingCart.updatedAt).utc().format("MM-DD-YYYY")] + 1) : 1;
            }

            result.totalItems += shoppingCart.items.length;
            devices[shoppingCart.deviceInfo] = devices[shoppingCart.deviceInfo] ? (devices[shoppingCart.deviceInfo] + 1) : 1
            locales[shoppingCart.locale] = locales[shoppingCart.locale] ? (locales[shoppingCart.locale] + 1) : 1
        })

        // Prepare sale stats
        result.averageItemPrice = `$${(result.totalSale / (result.itemSold || 1)).toFixed(2)}`;
        result.totalSale = `$${result.totalSale.toFixed(2)}`;
        result.tax = `$${result.tax.toFixed(2)}`;
        result.averageItemPerCart = (result.totalItems / shoppingCarts.length).toFixed(1);


        db.sequelize.query(`select count(*), date from (select date_trunc('day', "updatedAt") as date from "shoppingCarts") a group by date`).spread(function(visitData){
            var visitDataMap = {};
            visitData.map(function(v){
                visitDataMap[`${moment(v.date).utc().format("MM-DD-YYYY")}`] = Number(v.count);
            })

            var today = moment().startOf('day');
            var visits = [{
                name: 'Visit',
                data: []
            }]

            var sales = [{
                name: 'Sales',
                data: []
            }]

            var conversionRates = [{
                name: 'Conversion Rate',
                data: []
            }]
            
            for (var i = 0; i < 7; i++){
                if (visitDataMap[today.format("MM-DD-YYYY")]){
                    visits[0].data.unshift([today.valueOf(), visitDataMap[today.format("MM-DD-YYYY")]]);
                }
                else {
                    visits[0].data.unshift([today.valueOf(), 0]);
                }

                if (saleMap[today.format("MM-DD-YYYY")]){
                    sales[0].data.unshift([today.valueOf(), saleMap[today.format("MM-DD-YYYY")]]);
                }
                else {
                    sales[0].data.unshift([today.valueOf(), 0]);
                }

                if (saleCountMap[today.format("MM-DD-YYYY")]){
                    conversionRates[0].data.unshift([today.valueOf(), saleCountMap[today.format("MM-DD-YYYY")] / (visitDataMap[today.format("MM-DD-YYYY")]? visitDataMap[today.format("MM-DD-YYYY")] : 1) * 100 ]);
                }
                else {
                    conversionRates[0].data.unshift([today.valueOf(), 0]);
                }
                today = today.add("day", -1);
            }



            result.charts.visits = visits;
            result.charts.sales = sales;
            result.charts.conversionRates = conversionRates

            // Prepare device chart data
            Object.keys(devices).map(function(d){
                result.charts.devices.push([d, devices[d]])
            })

            // Prepare locale chart data
            Object.keys(locales).map(function(d){
                result.charts.locales.push([d, locales[d]])
            })

            return response.send(result)
        })
    })
}

module.exports.getPostPurchaseView = function(request, response){
    var shoppingCartId = request.query.shoppingCartId;
    db.ShoppingCart.findAll({
        where: {
            id: shoppingCartId
        }
    }).then(function(shoppingCarts){
        if (shoppingCarts.length == 0){
            return response.status(400).send({
                error: "INVALID_SHOPPING_CART_ID"
            })
        }

        var shoppingCart = shoppingCarts[0];
        return response.render("./customer/thankyou.ejs", { shoppingCart: shoppingCart })
    })
}

function getDeviceInfo(request) {
    var ua = request.headers['user-agent'];
    if (!ua) {
        return null;
    }
  
    var result = "Unknown";
  
    if (/like Mac OS X/.test(ua)) {
        result = 'iOS';
        if (/iPhone/.test(ua)){
            result = 'iPhone';
        }
        if (/iPad/.test(ua)){
            result = 'iPad';
        }
    }
  
    if (/Android/.test(ua)) {
      result = 'Android';
    }
  
    if (/webOS\//.test(ua)) {
      result = 'webOS';
    }
  
    if (/(Intel|PPC) Mac OS X/.test(ua)) {
      result = 'Mac';
    }
  
    if (/Windows NT/.test(ua)) {
      result = 'Windows';
    }
    return result;
};