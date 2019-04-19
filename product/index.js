const _ = require("lodash");
const db = require("../db");
const reqst = require("request");
const moment = require("moment");

module.exports.getProducts = function(request, response){
    getProducts_(request.query, function(err, products){
        if (err){
            return response.status(500).send({
                error: err
            })
        }
        return response.send(products)
    })
}

function getProducts_(input, cb){
    var limit = input.limit ? Number(input.limit) : 21
    var offset = input.offset ? Number(input.offset) : 0

    var query = {
        limit: limit + 1,
        offset: offset,
        where: {},
        include: [{
            model: db.Sku
        }]
    }

    var queryString = input.q ? _.trim(input.q) : null;
    if (!queryString || queryString == ""){
        query.where.name = { $ne: "null" }
    }
    else {
        query.where = {
            $or: [
                { name: { $iLike: `%${queryString}%` }},
                { keywords: { $iLike: `%${queryString}%` }},
            ]
        }
    }

    db.Product.findAndCountAll(query).then(result => {
        var products = result.rows;
        var count = result.count;
        var pagination = {}
        if (products.length > limit){
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

        return cb(null, {
            total: count,
            limit: limit, 
            offset: offset,
            data: products.slice(0, limit),
            pagination: pagination
        })
    })
}

module.exports.getProductsForCategory = function(request, response){  
    var category = request.params.category;
    getProducts_({q: category, limit: request.query.limit, offset: request.query.offset}, function(err, products){
        if (err){
            return response.status(500).send({
                error: err
            })
        }
        var params = {
            products: products,
            category: category[0].toUpperCase() + category.slice(1)
        }
        return response.render("./customer/categoryProducts", params)
    })
}

module.exports.queryProducts = function(request, response){  
    var searchTerm = request.query.q;
    getProducts_({q: searchTerm, limit: request.query.limit, offset: request.query.offset}, function(err, products){
        if (err){
            return response.status(500).send({
                error: err
            })
        }

        var params = {
            products: products,
            q: searchTerm,
        }
        return response.render("./customer/queryProducts", params)
    })
}

module.exports.getProduct = function(request, response){
    var productId = request.params.productId
    var mode = ["view", "api"].indexOf(request.params.mode) > -1 ? request.params.mode : "view"
    if (!productId || isNaN(productId)){
        return response.status(400).send({
            error: "INVALID_PRODUCT_ID"
        })
    }
    
    db.Product.findAll({
        where: {
            id: Number(productId)
        },
        include: [{
            model: db.Sku
        }]
    }).then(products => {       
        if (products.length == 0){
            return response.status(400).send({
                error: "INVALID_PRODUCT_ID"
            })
        }
        
        var product = JSON.parse(JSON.stringify(products[0]));

        var sizes = [];
        var colors = [];
        var colorNames = [];

        product.skus.map(function(sku){
            if (sku.size){
                if (sizes.indexOf(sku.size) > -1){
                    sku.sizeId = sizes.indexOf(sku.size);
                }
                else {
                    sku.sizeId = sizes.length;
                    sizes.push(sku.size);
                }
            }
            else {
                sku.sizeId = null;
            }

            if (sku.shadeName){
                if (colorNames.indexOf(sku.shadeName) > -1){
                    sku.colorId = colorNames.indexOf(sku.shadeName);
                }
                else {
                    sku.colorId = colorNames.length;
                    colorNames.push(sku.shadeName);
                    colors.push({
                        name: sku.shadeName,
                        hex: sku.colorHex ? sku.colorHex.split(",") : []
                    });
                }
            } 
            else {
                sku.colorId = null;
            }
        })

        product.sizes = sizes;
        product.colors = colors;
        
        getReviews(product.merchantId.split("PROD")[1], product.locale, function(err, reviewObject){
            product.reviews = reviewObject.reviews;
            product.totalReview = reviewObject.totalReview;
            product.recommendedRatio = reviewObject.recommendedRatio;

            product.ratingHistogram = reviewObject.ratingHistogram && reviewObject.ratingHistogram.length > 0? 
            reviewObject.ratingHistogram : 
            [
                { numStars: 5, count: 0, percentage: 0 },
                { numStars: 4, count: 0, percentage: 0 },
                { numStars: 3, count: 0, percentage: 0 },
                { numStars: 2, count: 0, percentage: 0 },
                { numStars: 1, count: 0, percentage: 0 },
            ];
            

            getRelatedProducts(product, function(err, relatedProducts){
                if (relatedProducts){
                    product.relatedProducts = relatedProducts;
                }

                if (mode == "api"){
                    return response.send(product)
                }
                else {
                    return response.render("customer/product.ejs", { product: product, selectedSkuId: 0 })
                }
            })
        })
    })  
}

function getRelatedProducts(product, cb){
    if (!product.relatedProducts || product.relatedProducts.length == 0){
        return cb(null, [])
    }

    var where = {
        $or:[]
    }

    product.relatedProducts.map(function(p){
        where.$or.push({
            merchantId: { $iLike: `%${p}%`}
        })
    })

    console.log("where: " + JSON.stringify(where, null, 4))
    db.Product.findAll({
        where: where
    }).then(products => {  
        return cb(null, products)
    })     
}

function getReviews(productId, locale, cb){
    var reviewUrl = locale == "en_us" ? 
        `https://readservices-b2c.powerreviews.com/m/846997/l/en_US/product/${productId}/reviews?` :
        `https://readservices-b2c.powerreviews.com/m/537116/l/fr_FR/product/${productId}/reviews?`
    reqst({
        url: reviewUrl,
        method: "GET",
        headers: {
			Authorization: "b4305b3e-0b67-4c77-ac64-362dbc855ca2"
        }
    }, function(err, res, body0){
        if (err){
            return cb(null, {
                totalReview: 0,
                reviews: []
            })
        }
        try {
            var body = JSON.parse(body0)
            var result = {
                totalReview: body.paging && body.paging.total_results ? body.paging.total_results : 0,
                recommended_ratio: 0,
                reviews: [],
                ratingHistogram: []
            }

            if (body.results && body.results[0]){
                var histogram = body.results[0].rollup.rating_histogram;
                result.recommendedRatio = body.results[0].rollup.recommended_ratio * 100;

                for (var i = 0; i < histogram.length; i++){
                    result.ratingHistogram.unshift({
                        numStars: i + 1,
                        count: histogram[i],
                        percentage: Math.ceil((histogram[i] / (result.totalReview && result.totalReview > 0 ? result.totalReview : 1)) * 100)
                    })
                }

                body.results[0].reviews.map(function(r){
                    result.reviews.push({
                        name: r.details.nickname,
                        headline: r.details.headline,
                        comments: r.details.comments,
                        location: r.details.location,
                        date: moment(r.details.created_date).format('ll'),
                        rating: r.metrics.rating
                    })
                })
            }
            return cb(null, result)
        }
        catch (e){
            return cb(null, {
                totalReview: 0,
                reviews: []
            })
        }
    })
}