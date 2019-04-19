const async = require("async");
const request = require("request");
const sqldb = require("./index")

// const locale = "fr_fr"
// const endPoint = "www.esteelauder.fr"

const locale = "en_us"
const endPoint = "www.esteelauder.co.uk"

function addProduct(categories, rawData, cb){
	var params = {
		merchantId: rawData.PATH,
		name: rawData.PROD_RGN_NAME,
		descriptions: {
			subHeading: rawData.PROD_RGN_SUBHEADING,
			detail: rawData.PRODUCT_DETAILS_MOBILE,
			benefits: rawData.ATTRIBUTE_DESC ? rawData.ATTRIBUTE_DESC[0]: null,
			howToUse: rawData.ATTRIBUTE_DESC ? rawData.ATTRIBUTE_DESC[1]: null,
			formulaFacts: rawData.ATTRIBUTE_DESC ? rawData.ATTRIBUTE_DESC[2]: null,
			skinType: rawData.ATTRIBUTE_DESC ? rawData.ATTRIBUTE_DESC[3]: null,
			idealFor: rawData.ATTRIBUTE_DESC ? rawData.ATTRIBUTE_DESC[4]: null,
		},
		averageRating: rawData.AVERAGE_RATING ? rawData.AVERAGE_RATING : 0,
 		isPublished: true,
		locale: locale,
      	images: {
			normal: "https://" + endPoint +  rawData.skus[0].MEDIUM_IMAGE[0]
		},
      	currency: "USD",
		priceRange: rawData.priceRange,
		relatedProducts: rawData.worksWith, 
		keywords: "" + categories[rawData.skus[0].PARENT_CAT_ID].category_name + (rawData.PROD_RGN_KEYWORDS ? (", " + rawData.PROD_RGN_KEYWORDS) : "")
	}

	sqldb.Product.create(params).then(function(product){
		return cb(null, product)
	}, function(err){
		return cb(err)
	})
}

function addSku(rawData, productId, cb){  
	var skus = rawData.skus
	// console.log("ra")
	async.each(skus, function(sku, icb){
		var params = {
			merchantId: sku.PATH,
			smooshImage: sku.LARGE_SMOOSH && sku.LARGE_SMOOSH != ""? ("https://" + endPoint + sku.LARGE_SMOOSH) : undefined,
			colorHex: sku.HEX_VALUE_STRING && sku.HEX_VALUE_STRING != "" ? sku.HEX_VALUE_STRING : undefined,
			image: sku.MEDIUM_IMAGE && sku.MEDIUM_IMAGE.length > 0 ? ("https://" + endPoint + sku.MEDIUM_IMAGE[0]): undefined,
			price: sku.PRICE,
			currency: "USD",
			shadeName: sku.SHADENAME,
			size: sku.PRODUCT_SIZE,
			isPublished: true, 
			inventory: 100,
			productId: productId
		}

		sqldb.Sku.create(params).then(function(sku){
			return icb()
		}, function(err){
			return icb(err)
		})
	}, function(err){
		return cb(err)
	})
}

function fetchCategoryProductMetadata(categoryId, cb) {
	var input = [{
		method: "prodcat",
		params: [{
			categories: [categoryId],
			category_fields: [
				"CATEGORY_ID",
				"CATEGORY_NAME",
				"products",
			],
			product_fields: [
				"PATH",
				"PROD_BASE_ID",
				"DEFAULT_PATH",
				"PRODUCT_ID",
				"PROD_RGN_NAME",
				"PROD_RGN_SUBHEADING",
				"PARENT_CAT_ID",
				"DEFAULT_CAT_ID",
				"displayName",
				"priceRange",
				"PROD_RGN_KEYWORDS",
				"SHORT_DESC",
				"ATTRIBUTE_DESC",
				"AVERAGE_RATING",
				"PRODUCT_DETAILS_MOBILE",
				"skus",
				"worksWith"
			],
			sku_fields: [
				"SMALL_IMAGE",
				"MEDIUM_IMAGE",
				"LARGE_IMAGE",
				"PATH",
				"SKU_BASE_ID",
				"DEFAULT_PATH",
				"SKU_ID",
				"SHADENAME",
				"INVENTORY_STATUS",
				"PRODUCT_ID",
				"PRODUCT_CODE",
				"PARENT_CAT_ID",
				"formattedPrice",
				"PRICE",
				"isShoppable",
				"PRODUCT_SIZE",
				"COLORGROUPING",
				"ATTRIBUTE_COLOR_FAMILY",
				"ATTRIBUTE_FINISH",
				"HEX_VALUE_STRING",
				"LARGE_SMOOSH",
				"isActive",
			]
		}]
	}]
 console.log("https://" + endPoint + "/rpc/jsonrpc.tmpl?BYPASS_AKAMAI=1&JSONRPC=" + JSON.stringify(input))
	request({
		url: "https://" + endPoint + "/rpc/jsonrpc.tmpl?BYPASS_AKAMAI=1&JSONRPC=" + JSON.stringify(input),
		method: "GET"
	}, function (err, res, body) {
		if (err)
			return cb(err)
		else {
			var response = JSON.parse(body)[0]
			if (response.error)
				return cb(response.error)
			else {
				return cb(null, response.result.value.categories[0].products)
			}
		}
	})
}

function crawlProductData(cb) {
	var categories = categoryMap()

	var categoryIds = categories[locale] ? Object.keys(categories[locale]) : []
	var count = 0

	async.eachOfSeries(categoryIds, function (categoryId, idx, ocb) {
		console.log("Start category " + categoryId)
		fetchCategoryProductMetadata(categoryId, function (err, products) {
			if (err) {
				console.log("Error while fetching product: " + categoryId + ": " + JSON.stringify(err))
			}

			async.each(products, function (product, icb) {
				if (product.skus.length > 0) {
					console.log("Indexing product " + product.PRODUCT_ID)
					count++
					// console.log(product, null, 4)
					addProduct(categories[locale], product, function(err, addedProduct){
						if (err){
							return icb(err)
						}
						addSku(product, addedProduct.id, function(err){
							return icb(err)
						})
					})
					// indexProductToES(product, eCommercePlatform, locale, storeLocale, function(err, data){
					//     if (err || (data._shards && data._shards.successful != 1))
					//         cLogger.log(LOG_SOURCE, "DEBUG", "Error when indexing " + product.PRODUCT_ID + ": " , err)
					// else
					// 	cLogger.log(LOG_SOURCE, "DEBUG", "Indexing " + product.PRODUCT_ID + " | data: " + JSON.stringify(data))
					// })
				}
				else
					return icb()
			}, function (err) {
				if (err)
					console.log("Crashed!: ")
				else
					console.log("Finish category " + categoryId)
				return ocb(err)
			})
		})
	}, function (err) {
		return cb(err, count)
	})
}


var categoryMap = function () {
	return {
		fr_fr: {
			"CAT570": {
				"category_id": "CAT570",
				"category_level": 1,
				"category_name": "Catalogue produit",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_Y2KP01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_Y2KP01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_Y2KP01_226x311_0.jpg"
				},
				"parent_category_id": null,
				"path": "CAT570",
				"subCategories": [{
					"category_id": "CAT9196",
					"category_level": 2,
					"category_name": "Aerin",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RNAJ01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RNAJ01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RNAJ01_226x311_0.jpg"
					},
					"parent_category_id": "CAT570",
					"path": "CAT9196"
				}, {
					"category_id": "CAT708",
					"category_level": 2,
					"category_name": "Nouveautés",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R41206_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R41206_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R41206_226x311_0.jpg"
					},
					"parent_category_id": "CAT570",
					"path": "CAT708"
				}, {
					"category_id": "CAT571",
					"category_level": 2,
					"category_name": "Parfum",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RN0401_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RN0401_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RN0401_226x311_0.jpg"
					},
					"parent_category_id": "CAT570",
					"path": "CAT571"
				}, {
					"category_id": "CAT661",
					"category_level": 2,
					"category_name": "Re-Nutriv",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R9EE01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R9EE01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R9EE01_226x311_0.jpg"
					},
					"parent_category_id": "CAT570",
					"path": "CAT661"
				}, {
					"category_id": "CAT681",
					"category_level": 2,
					"category_name": "Soin",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YRKF01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YRKF01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YRKF01_226x311_0.jpg"
					},
					"parent_category_id": "CAT570",
					"path": "CAT681"
				}, {
					"category_id": "CAT631",
					"category_level": 2,
					"category_name": "Maquillage",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RTXT01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RTXT01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RTXT01_226x311_0.jpg"
					},
					"parent_category_id": "CAT570",
					"path": "CAT631"
				}]
			},
			"CAT9196": {
				"category_id": "CAT9196",
				"category_level": 2,
				"category_name": "Aerin",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RNAJ01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RNAJ01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RNAJ01_226x311_0.jpg"
				},
				"parent_category_id": "CAT570",
				"path": "CAT9196",
				"subCategories": [{
					"category_id": "CAT16570",
					"category_level": 3,
					"category_name": "Bain & Corps",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R8TF01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R8TF01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R8TF01_226x311_0.jpg"
					},
					"parent_category_id": "CAT9196",
					"path": "CAT16570"
				}, {
					"category_id": "CAT12772",
					"category_level": 2,
					"category_name": "Aerin Édition limitée",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R8TC01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R8TC01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R8TC01_226x311_0.jpg"
					},
					"parent_category_id": "CAT9196",
					"path": "CAT12772"
				}, {
					"category_id": "CAT11989",
					"category_level": 3,
					"category_name": "Collection Classique",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P0JH01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P0JH01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P0JH01_226x311_0.jpg"
					},
					"parent_category_id": "CAT9196",
					"path": "CAT11989"
				}, {
					"category_id": "CAT16792",
					"category_level": 3,
					"category_name": "AERIN - Rose de Grasse",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R5F601_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R5F601_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R5F601_226x311_0.jpg"
					},
					"parent_category_id": "CAT9196",
					"path": "CAT16792"
				}]
			},
			"CAT16570": {
				"category_id": "CAT16570",
				"category_level": 3,
				"category_name": "Bain & Corps",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R8TF01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R8TF01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R8TF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9196",
				"path": "CAT16570",
				"subCategories": []
			},
			"CAT12772": {
				"category_id": "CAT12772",
				"category_level": 2,
				"category_name": "Aerin Édition limitée",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R8TC01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R8TC01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R8TC01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9196",
				"path": "CAT12772",
				"subCategories": []
			},
			"CAT11989": {
				"category_id": "CAT11989",
				"category_level": 3,
				"category_name": "Collection Classique",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P0JH01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P0JH01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P0JH01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9196",
				"path": "CAT11989",
				"subCategories": []
			},
			"CAT16792": {
				"category_id": "CAT16792",
				"category_level": 3,
				"category_name": "AERIN - Rose de Grasse",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R5F601_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R5F601_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R5F601_226x311_0.jpg"
				},
				"parent_category_id": "CAT9196",
				"path": "CAT16792",
				"subCategories": []
			},
			"CAT708": {
				"category_id": "CAT708",
				"category_level": 2,
				"category_name": "Nouveautés",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R41206_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R41206_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R41206_226x311_0.jpg"
				},
				"parent_category_id": "CAT570",
				"path": "CAT708",
				"subCategories": [{
					"category_id": "CAT1799",
					"category_level": 3,
					"category_name": "Bestsellers",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YF4901_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YF4901_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YF4901_226x311_0.jpg"
					},
					"parent_category_id": "CAT708",
					"path": "CAT1799"
				}]
			},
			"CAT1799": {
				"category_id": "CAT1799",
				"category_level": 3,
				"category_name": "Bestsellers",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YF4901_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YF4901_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YF4901_226x311_0.jpg"
				},
				"parent_category_id": "CAT708",
				"path": "CAT1799",
				"subCategories": []
			},
			"CAT571": {
				"category_id": "CAT571",
				"category_level": 2,
				"category_name": "Parfum",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RN0401_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RN0401_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RN0401_226x311_0.jpg"
				},
				"parent_category_id": "CAT570",
				"path": "CAT571",
				"subCategories": [{
					"category_id": "CAT8261",
					"category_level": 3,
					"category_name": "Collections",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJ0601_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJ0601_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJ0601_226x311_0.jpg"
					},
					"parent_category_id": "CAT571",
					"path": "CAT8261"
				}, {
					"category_id": "CAT1283",
					"category_level": 3,
					"category_name": "Sélection Beauté",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R1L1Y7_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R1L1Y7_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R1L1Y7_226x311_0.jpg"
					},
					"parent_category_id": "CAT571",
					"path": "CAT1283"
				}, {
					"category_id": "CAT9779",
					"category_level": 3,
					"category_name": "Parfum Femme",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRCE01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRCE01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRCE01_226x311_0.jpg"
					},
					"parent_category_id": "CAT571",
					"path": "CAT9779"
				}, {
					"category_id": "CAT12850",
					"category_level": 3,
					"category_name": "Parfum Femme",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
					},
					"parent_category_id": "CAT571",
					"path": "CAT12850"
				}, {
					"category_id": "CAT8257",
					"category_level": 3,
					"category_name": "Parfum Homme",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_1MJF01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_1MJF01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_1MJF01_226x311_0.jpg"
					},
					"parent_category_id": "CAT571",
					"path": "CAT8257"
				}]
			},
			"CAT8261": {
				"category_id": "CAT8261",
				"category_level": 3,
				"category_name": "Collections",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJ0601_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJ0601_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJ0601_226x311_0.jpg"
				},
				"parent_category_id": "CAT571",
				"path": "CAT8261",
				"subCategories": [{
					"category_id": "CAT11564",
					"category_level": 4,
					"category_name": "Modern Muse",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJ0601_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJ0601_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJ0601_226x311_0.jpg"
					},
					"parent_category_id": "CAT8261",
					"path": "CAT11564"
				}]
			},
			"CAT11564": {
				"category_id": "CAT11564",
				"category_level": 4,
				"category_name": "Modern Muse",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJ0601_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJ0601_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJ0601_226x311_0.jpg"
				},
				"parent_category_id": "CAT8261",
				"path": "CAT11564",
				"subCategories": []
			},
			"CAT1283": {
				"category_id": "CAT1283",
				"category_level": 3,
				"category_name": "Sélection Beauté",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R1L1Y7_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R1L1Y7_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R1L1Y7_226x311_0.jpg"
				},
				"parent_category_id": "CAT571",
				"path": "CAT1283",
				"subCategories": [{
					"category_id": "CAT630",
					"category_level": 4,
					"category_name": "Coffrets Parfum",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R1L1Y7_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R1L1Y7_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R1L1Y7_226x311_0.jpg"
					},
					"parent_category_id": "CAT1283",
					"path": "CAT630"
				}]
			},
			"CAT630": {
				"category_id": "CAT630",
				"category_level": 4,
				"category_name": "Coffrets Parfum",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R1L1Y7_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R1L1Y7_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R1L1Y7_226x311_0.jpg"
				},
				"parent_category_id": "CAT1283",
				"path": "CAT630",
				"subCategories": []
			},
			"CAT9779": {
				"category_id": "CAT9779",
				"category_level": 3,
				"category_name": "Parfum Femme",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRCE01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRCE01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRCE01_226x311_0.jpg"
				},
				"parent_category_id": "CAT571",
				"path": "CAT9779",
				"subCategories": [{
					"category_id": "CAT9782",
					"category_level": 4,
					"category_name": "Pleasures",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_701101_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_701101_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_701101_226x311_0.jpg"
					},
					"parent_category_id": "CAT9779",
					"path": "CAT9782"
				}, {
					"category_id": "CAT9781",
					"category_level": 4,
					"category_name": "Bronze Goddess",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RP5801_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RP5801_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RP5801_226x311_0.jpg"
					},
					"parent_category_id": "CAT9779",
					"path": "CAT9781"
				}, {
					"category_id": "CAT9780",
					"category_level": 4,
					"category_name": "Beautiful",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_480502_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_480502_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_480502_226x311_0.jpg"
					},
					"parent_category_id": "CAT9779",
					"path": "CAT9780"
				}, {
					"category_id": "CAT13093",
					"category_level": 4,
					"category_name": "Youth-Dew",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_091701_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_091701_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_091701_226x311_0.jpg"
					},
					"parent_category_id": "CAT9779",
					"path": "CAT13093"
				}, {
					"category_id": "CAT9786",
					"category_level": 4,
					"category_name": "Pure White Linen",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9CHK01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9CHK01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9CHK01_226x311_0.jpg"
					},
					"parent_category_id": "CAT9779",
					"path": "CAT9786"
				}, {
					"category_id": "CAT12898",
					"category_level": 4,
					"category_name": "Knowing",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
					},
					"parent_category_id": "CAT9779",
					"path": "CAT12898"
				}, {
					"category_id": "CAT9784",
					"category_level": 4,
					"category_name": "Sensuous",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9TMJ01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9TMJ01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9TMJ01_226x311_0.jpg"
					},
					"parent_category_id": "CAT9779",
					"path": "CAT9784"
				}, {
					"category_id": "CAT9783",
					"category_level": 4,
					"category_name": "Aerin Lauder",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9A9J01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9A9J01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9A9J01_226x311_0.jpg"
					},
					"parent_category_id": "CAT9779",
					"path": "CAT9783"
				}, {
					"category_id": "CAT9785",
					"category_level": 4,
					"category_name": "Les Classiques",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YX3A01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YX3A01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YX3A01_226x311_0.jpg"
					},
					"parent_category_id": "CAT9779",
					"path": "CAT9785"
				}]
			},
			"CAT9782": {
				"category_id": "CAT9782",
				"category_level": 4,
				"category_name": "Pleasures",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_701101_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_701101_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_701101_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9782",
				"subCategories": []
			},
			"CAT9781": {
				"category_id": "CAT9781",
				"category_level": 4,
				"category_name": "Bronze Goddess",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RP5801_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RP5801_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RP5801_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9781",
				"subCategories": []
			},
			"CAT9780": {
				"category_id": "CAT9780",
				"category_level": 4,
				"category_name": "Beautiful",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_480502_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_480502_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_480502_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9780",
				"subCategories": []
			},
			"CAT13093": {
				"category_id": "CAT13093",
				"category_level": 4,
				"category_name": "Youth-Dew",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_091701_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_091701_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_091701_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT13093",
				"subCategories": []
			},
			"CAT9786": {
				"category_id": "CAT9786",
				"category_level": 4,
				"category_name": "Pure White Linen",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9CHK01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9CHK01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9CHK01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9786",
				"subCategories": []
			},
			"CAT12898": {
				"category_id": "CAT12898",
				"category_level": 4,
				"category_name": "Knowing",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT12898",
				"subCategories": []
			},
			"CAT9784": {
				"category_id": "CAT9784",
				"category_level": 4,
				"category_name": "Sensuous",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9TMJ01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9TMJ01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9TMJ01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9784",
				"subCategories": []
			},
			"CAT9783": {
				"category_id": "CAT9783",
				"category_level": 4,
				"category_name": "Aerin Lauder",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9A9J01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9A9J01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9A9J01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9783",
				"subCategories": []
			},
			"CAT9785": {
				"category_id": "CAT9785",
				"category_level": 4,
				"category_name": "Les Classiques",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YX3A01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YX3A01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YX3A01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9785",
				"subCategories": []
			},
			"CAT12850": {
				"category_id": "CAT12850",
				"category_level": 3,
				"category_name": "Parfum Femme",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
				},
				"parent_category_id": "CAT571",
				"path": "CAT12850",
				"subCategories": [{
					"category_id": "CAT12970",
					"category_level": 4,
					"category_name": "Les Classiques",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YX3901_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YX3901_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YX3901_226x311_0.jpg"
					},
					"parent_category_id": "CAT12850",
					"path": "CAT12970"
				}, {
					"category_id": "CAT12851",
					"category_level": 4,
					"category_name": "Modern Muse",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJ0601_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJ0601_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJ0601_226x311_0.jpg"
					},
					"parent_category_id": "CAT12850",
					"path": "CAT12851"
				}, {
					"category_id": "CAT12855",
					"category_level": 4,
					"category_name": "Private Collection",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9A9J01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9A9J01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9A9J01_226x311_0.jpg"
					},
					"parent_category_id": "CAT12850",
					"path": "CAT12855"
				}, {
					"category_id": "CAT12853",
					"category_level": 4,
					"category_name": "Pleasures",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YE2901_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YE2901_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YE2901_226x311_0.jpg"
					},
					"parent_category_id": "CAT12850",
					"path": "CAT12853"
				}, {
					"category_id": "CAT12968",
					"category_level": 4,
					"category_name": "Knowing",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
					},
					"parent_category_id": "CAT12850",
					"path": "CAT12968"
				}, {
					"category_id": "CAT12852",
					"category_level": 4,
					"category_name": "Beautiful",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_464001_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_464001_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_464001_226x311_0.jpg"
					},
					"parent_category_id": "CAT12850",
					"path": "CAT12852"
				}, {
					"category_id": "CAT12854",
					"category_level": 4,
					"category_name": "Sensuous",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9TMJ01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9TMJ01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9TMJ01_226x311_0.jpg"
					},
					"parent_category_id": "CAT12850",
					"path": "CAT12854"
				}]
			},
			"CAT12970": {
				"category_id": "CAT12970",
				"category_level": 4,
				"category_name": "Les Classiques",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YX3901_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YX3901_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YX3901_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12970",
				"subCategories": []
			},
			"CAT12851": {
				"category_id": "CAT12851",
				"category_level": 4,
				"category_name": "Modern Muse",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJ0601_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJ0601_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJ0601_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12851",
				"subCategories": []
			},
			"CAT12855": {
				"category_id": "CAT12855",
				"category_level": 4,
				"category_name": "Private Collection",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9A9J01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9A9J01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9A9J01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12855",
				"subCategories": []
			},
			"CAT12853": {
				"category_id": "CAT12853",
				"category_level": 4,
				"category_name": "Pleasures",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YE2901_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YE2901_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YE2901_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12853",
				"subCategories": []
			},
			"CAT12968": {
				"category_id": "CAT12968",
				"category_level": 4,
				"category_name": "Knowing",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12968",
				"subCategories": []
			},
			"CAT12852": {
				"category_id": "CAT12852",
				"category_level": 4,
				"category_name": "Beautiful",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_464001_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_464001_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_464001_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12852",
				"subCategories": []
			},
			"CAT12854": {
				"category_id": "CAT12854",
				"category_level": 4,
				"category_name": "Sensuous",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9TMJ01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9TMJ01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9TMJ01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12854",
				"subCategories": []
			},
			"CAT8257": {
				"category_id": "CAT8257",
				"category_level": 3,
				"category_name": "Parfum Homme",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_1MJF01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_1MJF01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_1MJF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT571",
				"path": "CAT8257",
				"subCategories": [{
					"category_id": "CAT8260",
					"category_level": 4,
					"category_name": "Pleasures For Men",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_11A401_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_11A401_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_11A401_226x311_0.jpg"
					},
					"parent_category_id": "CAT8257",
					"path": "CAT8260"
				}, {
					"category_id": "CAT8258",
					"category_level": 4,
					"category_name": "Intuition For Men",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_1MJF01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_1MJF01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_1MJF01_226x311_0.jpg"
					},
					"parent_category_id": "CAT8257",
					"path": "CAT8258"
				}]
			},
			"CAT8260": {
				"category_id": "CAT8260",
				"category_level": 4,
				"category_name": "Pleasures For Men",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_11A401_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_11A401_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_11A401_226x311_0.jpg"
				},
				"parent_category_id": "CAT8257",
				"path": "CAT8260",
				"subCategories": []
			},
			"CAT8258": {
				"category_id": "CAT8258",
				"category_level": 4,
				"category_name": "Intuition For Men",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_1MJF01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_1MJF01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_1MJF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT8257",
				"path": "CAT8258",
				"subCategories": []
			},
			"CAT661": {
				"category_id": "CAT661",
				"category_level": 2,
				"category_name": "Re-Nutriv",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R9EE01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R9EE01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R9EE01_226x311_0.jpg"
				},
				"parent_category_id": "CAT570",
				"path": "CAT661",
				"subCategories": [{
					"category_id": "CAT669",
					"category_level": 3,
					"category_name": "Maquillage",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YH3001_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YH3001_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YH3001_226x311_0.jpg"
					},
					"parent_category_id": "CAT661",
					"path": "CAT669"
				}, {
					"category_id": "CAT674",
					"category_level": 3,
					"category_name": "Soin",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RNRH01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RNRH01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RNRH01_226x311_0.jpg"
					},
					"parent_category_id": "CAT661",
					"path": "CAT674"
				}, {
					"category_id": "CAT662",
					"category_level": 3,
					"category_name": "Collections",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RKF701_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RKF701_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RKF701_226x311_0.jpg"
					},
					"parent_category_id": "CAT661",
					"path": "CAT662"
				}]
			},
			"CAT669": {
				"category_id": "CAT669",
				"category_level": 3,
				"category_name": "Maquillage",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YH3001_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YH3001_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YH3001_226x311_0.jpg"
				},
				"parent_category_id": "CAT661",
				"path": "CAT669",
				"subCategories": [{
					"category_id": "CAT670",
					"category_level": 4,
					"category_name": "Anti-cernes",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YH3001_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YH3001_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YH3001_226x311_0.jpg"
					},
					"parent_category_id": "CAT669",
					"path": "CAT670"
				}, {
					"category_id": "CAT671",
					"category_level": 4,
					"category_name": "Maquillage",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YH3002_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YH3002_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YH3002_226x311_0.jpg"
					},
					"parent_category_id": "CAT669",
					"path": "CAT671"
				}]
			},
			"CAT670": {
				"category_id": "CAT670",
				"category_level": 4,
				"category_name": "Anti-cernes",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YH3001_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YH3001_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YH3001_226x311_0.jpg"
				},
				"parent_category_id": "CAT669",
				"path": "CAT670",
				"subCategories": []
			},
			"CAT671": {
				"category_id": "CAT671",
				"category_level": 4,
				"category_name": "Maquillage",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YH3002_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YH3002_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YH3002_226x311_0.jpg"
				},
				"parent_category_id": "CAT669",
				"path": "CAT671",
				"subCategories": []
			},
			"CAT674": {
				"category_id": "CAT674",
				"category_level": 3,
				"category_name": "Soin",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RNRH01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RNRH01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RNRH01_226x311_0.jpg"
				},
				"parent_category_id": "CAT661",
				"path": "CAT674",
				"subCategories": [{
					"category_id": "CAT678",
					"category_level": 4,
					"category_name": "Soin Corps",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RA8401_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RA8401_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RA8401_226x311_0.jpg"
					},
					"parent_category_id": "CAT674",
					"path": "CAT678"
				}, {
					"category_id": "CAT675",
					"category_level": 4,
					"category_name": "Soin Spécifique",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RNRH01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RNRH01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RNRH01_226x311_0.jpg"
					},
					"parent_category_id": "CAT674",
					"path": "CAT675"
				}, {
					"category_id": "CAT679",
					"category_level": 4,
					"category_name": "Sérum",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RH7Y01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RH7Y01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RH7Y01_226x311_0.jpg"
					},
					"parent_category_id": "CAT674",
					"path": "CAT679"
				}, {
					"category_id": "CAT676",
					"category_level": 4,
					"category_name": "Contour des Yeux",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RT8J01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RT8J01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RT8J01_226x311_0.jpg"
					},
					"parent_category_id": "CAT674",
					"path": "CAT676"
				}, {
					"category_id": "CAT680",
					"category_level": 4,
					"category_name": "Soin Spécifique",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_Y2KR01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_Y2KR01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_Y2KR01_226x311_0.jpg"
					},
					"parent_category_id": "CAT674",
					"path": "CAT680"
				}, {
					"category_id": "CAT677",
					"category_level": 4,
					"category_name": "Crème de Jour / Nuit",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RL4301_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RL4301_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RL4301_226x311_0.jpg"
					},
					"parent_category_id": "CAT674",
					"path": "CAT677"
				}]
			},
			"CAT678": {
				"category_id": "CAT678",
				"category_level": 4,
				"category_name": "Soin Corps",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RA8401_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RA8401_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RA8401_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT678",
				"subCategories": []
			},
			"CAT675": {
				"category_id": "CAT675",
				"category_level": 4,
				"category_name": "Soin Spécifique",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RNRH01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RNRH01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RNRH01_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT675",
				"subCategories": []
			},
			"CAT679": {
				"category_id": "CAT679",
				"category_level": 4,
				"category_name": "Sérum",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RH7Y01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RH7Y01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RH7Y01_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT679",
				"subCategories": []
			},
			"CAT676": {
				"category_id": "CAT676",
				"category_level": 4,
				"category_name": "Contour des Yeux",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RT8J01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RT8J01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RT8J01_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT676",
				"subCategories": []
			},
			"CAT680": {
				"category_id": "CAT680",
				"category_level": 4,
				"category_name": "Soin Spécifique",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_Y2KR01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_Y2KR01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_Y2KR01_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT680",
				"subCategories": []
			},
			"CAT677": {
				"category_id": "CAT677",
				"category_level": 4,
				"category_name": "Crème de Jour / Nuit",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RL4301_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RL4301_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RL4301_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT677",
				"subCategories": [{
					"category_id": "CAT2399",
					"category_level": 5,
					"category_name": "Grands formats de Luxe",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WH9X01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WH9X01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WH9X01_226x311_0.jpg"
					},
					"parent_category_id": "CAT677",
					"path": "CAT2399"
				}]
			},
			"CAT2399": {
				"category_id": "CAT2399",
				"category_level": 5,
				"category_name": "Grands formats de Luxe",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WH9X01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WH9X01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WH9X01_226x311_0.jpg"
				},
				"parent_category_id": "CAT677",
				"path": "CAT2399",
				"subCategories": []
			},
			"CAT662": {
				"category_id": "CAT662",
				"category_level": 3,
				"category_name": "Collections",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RKF701_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RKF701_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RKF701_226x311_0.jpg"
				},
				"parent_category_id": "CAT661",
				"path": "CAT662",
				"subCategories": [{
					"category_id": "CAT21371",
					"category_level": 4,
					"category_name": "Ultimate Renewal",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RT8H01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RT8H01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RT8H01_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT21371"
				}, {
					"category_id": "CAT665",
					"category_level": 4,
					"category_name": "Re-naissance",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WP1201_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WP1201_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WP1201_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT665"
				}, {
					"category_id": "CAT12972",
					"category_level": 4,
					"category_name": "Énergisant Confort Extrême",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WYMH01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WYMH01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WYMH01_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT12972"
				}, {
					"category_id": "CAT663",
					"category_level": 4,
					"category_name": "Re-Nutriv Classique",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_168401_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_168401_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_168401_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT663"
				}, {
					"category_id": "CAT12971",
					"category_level": 4,
					"category_name": "Lifting Suprême Correction Anti-âge",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RT8N01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RT8N01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RT8N01_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT12971"
				}, {
					"category_id": "CAT11855,CAT21671",
					"category_level": 4,
					"category_name": "Radiant White",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R9EE01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R9EE01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R9EE01_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT11855"
					/*
					  }, {
					  "category_id": "CAT21671",
					  "category_level": 4,
					  "category_name": "Radiant White",
					  "category_image": {
					  "LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RL4301_420x578_0.jpg"],
					  "MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RL4301_308x424_0.jpg"],
					  "SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RL4301_226x311_0.jpg"
					  },
					  "parent_category_id": "CAT662",
					  "path": "CAT21671"
					*/
				}, {
					"category_id": "CAT17954",
					"category_level": 4,
					"category_name": "Ultimate Lift Regenerating Youth",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RNRH01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RNRH01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RNRH01_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT17954"
				}, {
					"category_id": "CAT9942",
					"category_level": 4,
					"category_name": "Rénovatrice Anti-rides Intensive",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_Y75001_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_Y75001_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_Y75001_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT9942"
				}, {
					"category_id": "CAT13797",
					"category_level": 4,
					"category_name": "Ultimate Diamond",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RKF701_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RKF701_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RKF701_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT13797"
				}, {
					"category_id": "CAT13783",
					"category_level": 4,
					"category_name": "Re-Nutriv Ultimate Diamond",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R1YG01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R1YG01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R1YG01_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT13783"
				}, {
					"category_id": "CAT664",
					"category_level": 4,
					"category_name": "Re-naissance",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_1J2T01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_1J2T01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_1J2T01_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT664"
				}, {
					"category_id": "CAT667",
					"category_level": 4,
					"category_name": "Autres Collections",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RT8N01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RT8N01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RT8N01_226x311_0.jpg"
					},
					"parent_category_id": "CAT662",
					"path": "CAT667"
				}]
			},
			"CAT21371": {
				"category_id": "CAT21371",
				"category_level": 4,
				"category_name": "Ultimate Renewal",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RT8H01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RT8H01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RT8H01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT21371",
				"subCategories": []
			},
			"CAT665": {
				"category_id": "CAT665",
				"category_level": 4,
				"category_name": "Re-naissance",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WP1201_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WP1201_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WP1201_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT665",
				"subCategories": []
			},
			"CAT12972": {
				"category_id": "CAT12972",
				"category_level": 4,
				"category_name": "Énergisant Confort Extrême",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WYMH01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WYMH01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WYMH01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT12972",
				"subCategories": []
			},
			"CAT663": {
				"category_id": "CAT663",
				"category_level": 4,
				"category_name": "Re-Nutriv Classique",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_168401_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_168401_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_168401_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT663",
				"subCategories": []
			},
			"CAT12971": {
				"category_id": "CAT12971",
				"category_level": 4,
				"category_name": "Lifting Suprême Correction Anti-âge",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RT8N01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RT8N01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RT8N01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT12971",
				"subCategories": []
			},
			"CAT11855": {
				"category_id": "CAT11855",
				"category_level": 4,
				"category_name": "Radiant White",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R9EE01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R9EE01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R9EE01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT11855",
				"subCategories": []
			},
			"CAT21671": {
				"category_id": "CAT21671",
				"category_level": 4,
				"category_name": "Radiant White",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RL4301_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RL4301_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RL4301_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT21671",
				"subCategories": []
			},
			"CAT17954": {
				"category_id": "CAT17954",
				"category_level": 4,
				"category_name": "Ultimate Lift Regenerating Youth",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RNRH01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RNRH01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RNRH01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT17954",
				"subCategories": []
			},
			"CAT9942": {
				"category_id": "CAT9942",
				"category_level": 4,
				"category_name": "Rénovatrice Anti-rides Intensive",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_Y75001_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_Y75001_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_Y75001_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT9942",
				"subCategories": []
			},
			"CAT13797": {
				"category_id": "CAT13797",
				"category_level": 4,
				"category_name": "Ultimate Diamond",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RKF701_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RKF701_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RKF701_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT13797",
				"subCategories": []
			},
			"CAT13783": {
				"category_id": "CAT13783",
				"category_level": 4,
				"category_name": "Re-Nutriv Ultimate Diamond",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R1YG01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R1YG01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R1YG01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT13783",
				"subCategories": []
			},
			"CAT664": {
				"category_id": "CAT664",
				"category_level": 4,
				"category_name": "Re-naissance",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_1J2T01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_1J2T01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_1J2T01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT664",
				"subCategories": []
			},
			"CAT667": {
				"category_id": "CAT667",
				"category_level": 4,
				"category_name": "Autres Collections",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RT8N01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RT8N01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RT8N01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT667",
				"subCategories": []
			},
			"CAT681": {
				"category_id": "CAT681",
				"category_level": 2,
				"category_name": "Soin",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YRKF01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YRKF01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YRKF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT570",
				"path": "CAT681",
				"subCategories": [{
					"category_id": "CAT1285",
					"category_level": 3,
					"category_name": "Sélection Beauté",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R17AY7_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R17AY7_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R17AY7_226x311_0.jpg"
					},
					"parent_category_id": "CAT681",
					"path": "CAT1285"
				}, {
					"category_id": "CAT12966",
					"category_level": 3,
					"category_name": "Besoins",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RX4C01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RX4C01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RX4C01_226x311_0.jpg"
					},
					"parent_category_id": "CAT681",
					"path": "CAT12966"
				}, {
					"category_id": "CAT683",
					"category_level": 3,
					"category_name": "Catégories",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_Y2TC01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_Y2TC01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_Y2TC01_226x311_0.jpg"
					},
					"parent_category_id": "CAT681",
					"path": "CAT683"
				}]
			},
			"CAT1285": {
				"category_id": "CAT1285",
				"category_level": 3,
				"category_name": "Sélection Beauté",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R17AY7_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R17AY7_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R17AY7_226x311_0.jpg"
				},
				"parent_category_id": "CAT681",
				"path": "CAT1285",
				"subCategories": [{
					"category_id": "CAT707",
					"category_level": 4,
					"category_name": "Coffrets Soin",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R17AY7_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R17AY7_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R17AY7_226x311_0.jpg"
					},
					"parent_category_id": "CAT1285",
					"path": "CAT707"
				}]
			},
			"CAT707": {
				"category_id": "CAT707",
				"category_level": 4,
				"category_name": "Coffrets Soin",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R17AY7_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R17AY7_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R17AY7_226x311_0.jpg"
				},
				"parent_category_id": "CAT1285",
				"path": "CAT707",
				"subCategories": []
			},
			"CAT12966": {
				"category_id": "CAT12966",
				"category_level": 3,
				"category_name": "Besoins",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RX4C01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RX4C01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RX4C01_226x311_0.jpg"
				},
				"parent_category_id": "CAT681",
				"path": "CAT12966",
				"subCategories": [{
					"category_id": "CAT19755",
					"category_level": 4,
					"category_name": "Rides / Ridules",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRLM01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRLM01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRLM01_226x311_0.jpg"
					},
					"parent_category_id": "CAT12966",
					"path": "CAT19755"
				}, {
					"category_id": "CAT19756",
					"category_level": 4,
					"category_name": "Galbe / Fermeté",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRLM01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRLM01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRLM01_226x311_0.jpg"
					},
					"parent_category_id": "CAT12966",
					"path": "CAT19756"
				}, {
					"category_id": "CAT19759",
					"category_level": 4,
					"category_name": "Anti-Taches",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YTRY01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YTRY01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YTRY01_226x311_0.jpg"
					},
					"parent_category_id": "CAT12966",
					"path": "CAT19759"
				}, {
					"category_id": "CAT19757",
					"category_level": 4,
					"category_name": "Anti-Âge Global",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YF4901_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YF4901_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YF4901_226x311_0.jpg"
					},
					"parent_category_id": "CAT12966",
					"path": "CAT19757"
				}, {
					"category_id": "CAT12967",
					"category_level": 4,
					"category_name": "Hydratation / Éclat",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RX4C01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RX4C01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RX4C01_226x311_0.jpg"
					},
					"parent_category_id": "CAT12966",
					"path": "CAT12967"
				}, {
					"category_id": "CAT19760",
					"category_level": 4,
					"category_name": "Anti-Imperfections",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YGPX01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YGPX01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YGPX01_226x311_0.jpg"
					},
					"parent_category_id": "CAT12966",
					"path": "CAT19760"
				}, {
					"category_id": "CAT19758",
					"category_level": 4,
					"category_name": "Matité",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9NE101_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9NE101_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9NE101_226x311_0.jpg"
					},
					"parent_category_id": "CAT12966",
					"path": "CAT19758"
				}]
			},
			"CAT19755": {
				"category_id": "CAT19755",
				"category_level": 4,
				"category_name": "Rides / Ridules",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRLM01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRLM01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRLM01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12966",
				"path": "CAT19755",
				"subCategories": []
			},
			"CAT19756": {
				"category_id": "CAT19756",
				"category_level": 4,
				"category_name": "Galbe / Fermeté",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRLM01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRLM01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRLM01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12966",
				"path": "CAT19756",
				"subCategories": []
			},
			"CAT19759": {
				"category_id": "CAT19759",
				"category_level": 4,
				"category_name": "Anti-Taches",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YTRY01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YTRY01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YTRY01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12966",
				"path": "CAT19759",
				"subCategories": []
			},
			"CAT19757": {
				"category_id": "CAT19757",
				"category_level": 4,
				"category_name": "Anti-Âge Global",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YF4901_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YF4901_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YF4901_226x311_0.jpg"
				},
				"parent_category_id": "CAT12966",
				"path": "CAT19757",
				"subCategories": []
			},
			"CAT12967": {
				"category_id": "CAT12967",
				"category_level": 4,
				"category_name": "Hydratation / Éclat",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RX4C01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RX4C01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RX4C01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12966",
				"path": "CAT12967",
				"subCategories": []
			},
			"CAT19760": {
				"category_id": "CAT19760",
				"category_level": 4,
				"category_name": "Anti-Imperfections",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YGPX01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YGPX01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YGPX01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12966",
				"path": "CAT19760",
				"subCategories": []
			},
			"CAT19758": {
				"category_id": "CAT19758",
				"category_level": 4,
				"category_name": "Matité",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9NE101_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9NE101_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9NE101_226x311_0.jpg"
				},
				"parent_category_id": "CAT12966",
				"path": "CAT19758",
				"subCategories": []
			},
			"CAT683": {
				"category_id": "CAT683",
				"category_level": 3,
				"category_name": "Catégories",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_Y2TC01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_Y2TC01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_Y2TC01_226x311_0.jpg"
				},
				"parent_category_id": "CAT681",
				"path": "CAT683",
				"subCategories": [{
					"category_id": "CAT1216",
					"category_level": 4,
					"category_name": "Protection solaire",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RTEK01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RTEK01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RTEK01_226x311_0.jpg"
					},
					"parent_category_id": "CAT683",
					"path": "CAT1216"
				}, {
					"category_id": "CAT686",
					"category_level": 4,
					"category_name": "Démaquillants",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YTRR01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YTRR01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YTRR01_226x311_0.jpg"
					},
					"parent_category_id": "CAT683",
					"path": "CAT686"
				}, {
					"category_id": "CAT12367",
					"category_level": 4,
					"category_name": "Crème Teintée",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_Y4PJ01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_Y4PJ01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_Y4PJ01_226x311_0.jpg"
					},
					"parent_category_id": "CAT683",
					"path": "CAT12367"
				}, {
					"category_id": "CAT685",
					"category_level": 4,
					"category_name": "Contour des Yeux",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRGH01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRGH01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRGH01_226x311_0.jpg"
					},
					"parent_category_id": "CAT683",
					"path": "CAT685"
				}, {
					"category_id": "CAT687",
					"category_level": 4,
					"category_name": "Exfoliant, Masque",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRGJ01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRGJ01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRGJ01_226x311_0.jpg"
					},
					"parent_category_id": "CAT683",
					"path": "CAT687"
				}, {
					"category_id": "CAT684",
					"category_level": 4,
					"category_name": "Démaquillant, Nettoyant",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RPA601_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RPA601_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RPA601_226x311_0.jpg"
					},
					"parent_category_id": "CAT683",
					"path": "CAT684"
				}, {
					"category_id": "CAT688",
					"category_level": 4,
					"category_name": "Crème de Jour / Nuit",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJ1C01_FR_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJ1C01_FR_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJ1C01_FR_226x311_0.jpg"
					},
					"parent_category_id": "CAT683",
					"path": "CAT688"
				}, {
					"category_id": "CAT14707",
					"category_level": 4,
					"category_name": "Huile Visage",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RFFY01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RFFY01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RFFY01_226x311_0.jpg"
					},
					"parent_category_id": "CAT683",
					"path": "CAT14707"
				}, {
					"category_id": "CAT693",
					"category_level": 4,
					"category_name": "Soins spécifiques",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_REGW01_FR_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_REGW01_FR_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_REGW01_FR_226x311_0.jpg"
					},
					"parent_category_id": "CAT683",
					"path": "CAT693"
				}, {
					"category_id": "CAT689",
					"category_level": 4,
					"category_name": "Sérum",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RY9701_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RY9701_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RY9701_226x311_0.jpg"
					},
					"parent_category_id": "CAT683",
					"path": "CAT689"
				}]
			},
			"CAT1216": {
				"category_id": "CAT1216",
				"category_level": 4,
				"category_name": "Protection solaire",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RTEK01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RTEK01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RTEK01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT1216",
				"subCategories": []
			},
			"CAT686": {
				"category_id": "CAT686",
				"category_level": 4,
				"category_name": "Démaquillants",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_YTRR01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_YTRR01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_YTRR01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT686",
				"subCategories": []
			},
			"CAT12367": {
				"category_id": "CAT12367",
				"category_level": 4,
				"category_name": "Crème Teintée",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_Y4PJ01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_Y4PJ01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_Y4PJ01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT12367",
				"subCategories": []
			},
			"CAT685": {
				"category_id": "CAT685",
				"category_level": 4,
				"category_name": "Contour des Yeux",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRGH01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRGH01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRGH01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT685",
				"subCategories": []
			},
			"CAT687": {
				"category_id": "CAT687",
				"category_level": 4,
				"category_name": "Exfoliant, Masque",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRGJ01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRGJ01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRGJ01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT687",
				"subCategories": []
			},
			"CAT684": {
				"category_id": "CAT684",
				"category_level": 4,
				"category_name": "Démaquillant, Nettoyant",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RPA601_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RPA601_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RPA601_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT684",
				"subCategories": []
			},
			"CAT688": {
				"category_id": "CAT688",
				"category_level": 4,
				"category_name": "Crème de Jour / Nuit",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJ1C01_FR_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJ1C01_FR_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJ1C01_FR_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT688",
				"subCategories": []
			},
			"CAT14707": {
				"category_id": "CAT14707",
				"category_level": 4,
				"category_name": "Huile Visage",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RFFY01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RFFY01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RFFY01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT14707",
				"subCategories": []
			},
			"CAT693": {
				"category_id": "CAT693",
				"category_level": 4,
				"category_name": "Soins spécifiques",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_REGW01_FR_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_REGW01_FR_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_REGW01_FR_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT693",
				"subCategories": []
			},
			"CAT689": {
				"category_id": "CAT689",
				"category_level": 4,
				"category_name": "Sérum",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RY9701_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RY9701_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RY9701_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT689",
				"subCategories": [{
					"category_id": "CAT3751",
					"category_level": 5,
					"category_name": "Grands formats de Luxe",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9MTF01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9MTF01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9MTF01_226x311_0.jpg"
					},
					"parent_category_id": "CAT689",
					"path": "CAT3751"
				}]
			},
			"CAT3751": {
				"category_id": "CAT3751",
				"category_level": 5,
				"category_name": "Grands formats de Luxe",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_9MTF01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_9MTF01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_9MTF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT689",
				"path": "CAT3751",
				"subCategories": []
			},
			"CAT631": {
				"category_id": "CAT631",
				"category_level": 2,
				"category_name": "Maquillage",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RTXT01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RTXT01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RTXT01_226x311_0.jpg"
				},
				"parent_category_id": "CAT570",
				"path": "CAT631",
				"subCategories": [{
					"category_id": "CAT12882",
					"category_level": 3,
					"category_name": "Accessoires",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WA5N01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WA5N01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WA5N01_226x311_0.jpg"
					},
					"parent_category_id": "CAT631",
					"path": "CAT12882"
				}, {
					"category_id": "CAT8315",
					"category_level": 3,
					"category_name": "Ongles",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WG6310_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WG6310_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WG6310_226x311_0.jpg"
					},
					"parent_category_id": "CAT631",
					"path": "CAT8315"
				}, {
					"category_id": "CAT654",
					"category_level": 3,
					"category_name": "Accessoires",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RR9601_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RR9601_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RR9601_226x311_0.jpg"
					},
					"parent_category_id": "CAT631",
					"path": "CAT654"
				}, {
					"category_id": "CAT638",
					"category_level": 3,
					"category_name": "Visage",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P1JC01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P1JC01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P1JC01_226x311_0.jpg"
					},
					"parent_category_id": "CAT631",
					"path": "CAT638"
				}, {
					"category_id": "CAT646",
					"category_level": 3,
					"category_name": "Lèvres",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJR406_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJR406_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJR406_226x311_0.jpg"
					},
					"parent_category_id": "CAT631",
					"path": "CAT646"
				}, {
					"category_id": "CAT633",
					"category_level": 3,
					"category_name": "Yeux",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RMY804_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RMY804_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RMY804_226x311_0.jpg"
					},
					"parent_category_id": "CAT631",
					"path": "CAT633"
				}]
			},
			"CAT12882": {
				"category_id": "CAT12882",
				"category_level": 3,
				"category_name": "Accessoires",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WA5N01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WA5N01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WA5N01_226x311_0.jpg"
				},
				"parent_category_id": "CAT631",
				"path": "CAT12882",
				"subCategories": [{
					"category_id": "CAT12883",
					"category_level": 4,
					"category_name": "Pinceau",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WA5N01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WA5N01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WA5N01_226x311_0.jpg"
					},
					"parent_category_id": "CAT12882",
					"path": "CAT12883"
				}]
			},
			"CAT12883": {
				"category_id": "CAT12883",
				"category_level": 4,
				"category_name": "Pinceau",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WA5N01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WA5N01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WA5N01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12882",
				"path": "CAT12883",
				"subCategories": []
			},
			"CAT8315": {
				"category_id": "CAT8315",
				"category_level": 3,
				"category_name": "Ongles",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WG6310_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WG6310_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WG6310_226x311_0.jpg"
				},
				"parent_category_id": "CAT631",
				"path": "CAT8315",
				"subCategories": [{
					"category_id": "CAT8316",
					"category_level": 4,
					"category_name": "Vernis à ongles",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WG6310_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WG6310_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WG6310_226x311_0.jpg"
					},
					"parent_category_id": "CAT8315",
					"path": "CAT8316"
				}]
			},
			"CAT8316": {
				"category_id": "CAT8316",
				"category_level": 4,
				"category_name": "Vernis à ongles",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_WG6310_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_WG6310_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_WG6310_226x311_0.jpg"
				},
				"parent_category_id": "CAT8315",
				"path": "CAT8316",
				"subCategories": []
			},
			"CAT654": {
				"category_id": "CAT654",
				"category_level": 3,
				"category_name": "Accessoires",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RR9601_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RR9601_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RR9601_226x311_0.jpg"
				},
				"parent_category_id": "CAT631",
				"path": "CAT654",
				"subCategories": [{
					"category_id": "CAT653",
					"category_level": 4,
					"category_name": "Coffrets Maquillage",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RR9601_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RR9601_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RR9601_226x311_0.jpg"
					},
					"parent_category_id": "CAT654",
					"path": "CAT653"
				}]
			},
			"CAT653": {
				"category_id": "CAT653",
				"category_level": 4,
				"category_name": "Coffrets Maquillage",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RR9601_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RR9601_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RR9601_226x311_0.jpg"
				},
				"parent_category_id": "CAT654",
				"path": "CAT653",
				"subCategories": []
			},
			"CAT638": {
				"category_id": "CAT638",
				"category_level": 3,
				"category_name": "Visage",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P1JC01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P1JC01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P1JC01_226x311_0.jpg"
				},
				"parent_category_id": "CAT631",
				"path": "CAT638",
				"subCategories": [{
					"category_id": "CAT644",
					"category_level": 4,
					"category_name": "Poudre",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RX0L01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RX0L01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RX0L01_226x311_0.jpg"
					},
					"parent_category_id": "CAT638",
					"path": "CAT644"
				}, {
					"category_id": "CAT642",
					"category_level": 4,
					"category_name": "Anti Cernes",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P1PA07_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P1PA07_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P1PA07_226x311_0.jpg"
					},
					"parent_category_id": "CAT638",
					"path": "CAT642"
				}, {
					"category_id": "CAT641",
					"category_level": 4,
					"category_name": "Poudre",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P1JC01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P1JC01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P1JC01_226x311_0.jpg"
					},
					"parent_category_id": "CAT638",
					"path": "CAT641"
				}, {
					"category_id": "CAT1473",
					"category_level": 4,
					"category_name": "Base de Teint",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P1PA01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P1PA01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P1PA01_226x311_0.jpg"
					},
					"parent_category_id": "CAT638",
					"path": "CAT1473"
				}, {
					"category_id": "CAT643",
					"category_level": 4,
					"category_name": "Fond de Teint",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P1JC01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P1JC01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P1JC01_226x311_0.jpg"
					},
					"parent_category_id": "CAT638",
					"path": "CAT643"
				}, {
					"category_id": "CAT639",
					"category_level": 4,
					"category_name": "Blush",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RX0L01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RX0L01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RX0L01_226x311_0.jpg"
					},
					"parent_category_id": "CAT638",
					"path": "CAT639"
				}, {
					"category_id": "CAT640",
					"category_level": 4,
					"category_name": "Poudre Bronzante",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRK301_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRK301_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRK301_226x311_0.jpg"
					},
					"parent_category_id": "CAT638",
					"path": "CAT640"
				}]
			},
			"CAT644": {
				"category_id": "CAT644",
				"category_level": 4,
				"category_name": "Poudre",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RX0L01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RX0L01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RX0L01_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT644",
				"subCategories": []
			},
			"CAT642": {
				"category_id": "CAT642",
				"category_level": 4,
				"category_name": "Anti Cernes",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P1PA07_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P1PA07_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P1PA07_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT642",
				"subCategories": []
			},
			"CAT641": {
				"category_id": "CAT641",
				"category_level": 4,
				"category_name": "Poudre",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P1JC01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P1JC01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P1JC01_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT641",
				"subCategories": []
			},
			"CAT1473": {
				"category_id": "CAT1473",
				"category_level": 4,
				"category_name": "Base de Teint",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P1PA01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P1PA01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P1PA01_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT1473",
				"subCategories": []
			},
			"CAT643": {
				"category_id": "CAT643",
				"category_level": 4,
				"category_name": "Fond de Teint",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P1JC01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P1JC01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P1JC01_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT643",
				"subCategories": []
			},
			"CAT639": {
				"category_id": "CAT639",
				"category_level": 4,
				"category_name": "Blush",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RX0L01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RX0L01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RX0L01_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT639",
				"subCategories": []
			},
			"CAT640": {
				"category_id": "CAT640",
				"category_level": 4,
				"category_name": "Poudre Bronzante",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RRK301_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RRK301_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RRK301_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT640",
				"subCategories": []
			},
			"CAT646": {
				"category_id": "CAT646",
				"category_level": 3,
				"category_name": "Lèvres",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJR406_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJR406_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJR406_226x311_0.jpg"
				},
				"parent_category_id": "CAT631",
				"path": "CAT646",
				"subCategories": [{
					"category_id": "CAT647",
					"category_level": 4,
					"category_name": "Gloss",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJR403_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJR403_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJR403_226x311_0.jpg"
					},
					"parent_category_id": "CAT646",
					"path": "CAT647"
				}, {
					"category_id": "CAT20061",
					"category_level": 4,
					"category_name": "Baume à Lèvres",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R66802_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R66802_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R66802_226x311_0.jpg"
					},
					"parent_category_id": "CAT646",
					"path": "CAT20061"
				}, {
					"category_id": "CAT649",
					"category_level": 4,
					"category_name": "Rouge à Lèvres",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P35C01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P35C01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P35C01_226x311_0.jpg"
					},
					"parent_category_id": "CAT646",
					"path": "CAT649"
				}, {
					"category_id": "CAT648",
					"category_level": 4,
					"category_name": "Crayon à Lèvres",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_W3E109_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_W3E109_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_W3E109_226x311_0.jpg"
					},
					"parent_category_id": "CAT646",
					"path": "CAT648"
				}]
			},
			"CAT647": {
				"category_id": "CAT647",
				"category_level": 4,
				"category_name": "Gloss",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RJR403_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RJR403_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RJR403_226x311_0.jpg"
				},
				"parent_category_id": "CAT646",
				"path": "CAT647",
				"subCategories": []
			},
			"CAT20061": {
				"category_id": "CAT20061",
				"category_level": 4,
				"category_name": "Baume à Lèvres",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_R66802_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_R66802_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_R66802_226x311_0.jpg"
				},
				"parent_category_id": "CAT646",
				"path": "CAT20061",
				"subCategories": []
			},
			"CAT649": {
				"category_id": "CAT649",
				"category_level": 4,
				"category_name": "Rouge à Lèvres",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P35C01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P35C01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P35C01_226x311_0.jpg"
				},
				"parent_category_id": "CAT646",
				"path": "CAT649",
				"subCategories": []
			},
			"CAT648": {
				"category_id": "CAT648",
				"category_level": 4,
				"category_name": "Crayon à Lèvres",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_W3E109_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_W3E109_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_W3E109_226x311_0.jpg"
				},
				"parent_category_id": "CAT646",
				"path": "CAT648",
				"subCategories": []
			},
			"CAT633": {
				"category_id": "CAT633",
				"category_level": 3,
				"category_name": "Yeux",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RMY804_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RMY804_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RMY804_226x311_0.jpg"
				},
				"parent_category_id": "CAT631",
				"path": "CAT633",
				"subCategories": [{
					"category_id": "CAT635",
					"category_level": 4,
					"category_name": "Crayon, Eyeliner",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P39402_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P39402_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P39402_226x311_0.jpg"
					},
					"parent_category_id": "CAT633",
					"path": "CAT635"
				}, {
					"category_id": "CAT634",
					"category_level": 4,
					"category_name": "Sourcil",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RH8G01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RH8G01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RH8G01_226x311_0.jpg"
					},
					"parent_category_id": "CAT633",
					"path": "CAT634"
				}, {
					"category_id": "CAT637",
					"category_level": 4,
					"category_name": "Mascara",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P41L08_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P41L08_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P41L08_226x311_0.jpg"
					},
					"parent_category_id": "CAT633",
					"path": "CAT637"
				}, {
					"category_id": "CAT636",
					"category_level": 4,
					"category_name": "Fard à Paupières",
					"category_image": {
						"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P35G01_420x578_0.jpg"],
						"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P35G01_308x424_0.jpg"],
						"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P35G01_226x311_0.jpg"
					},
					"parent_category_id": "CAT633",
					"path": "CAT636"
				}]
			},
			"CAT635": {
				"category_id": "CAT635",
				"category_level": 4,
				"category_name": "Crayon, Eyeliner",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P39402_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P39402_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P39402_226x311_0.jpg"
				},
				"parent_category_id": "CAT633",
				"path": "CAT635",
				"subCategories": []
			},
			"CAT634": {
				"category_id": "CAT634",
				"category_level": 4,
				"category_name": "Sourcil",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_RH8G01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_RH8G01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_RH8G01_226x311_0.jpg"
				},
				"parent_category_id": "CAT633",
				"path": "CAT634",
				"subCategories": []
			},
			"CAT637": {
				"category_id": "CAT637",
				"category_level": 4,
				"category_name": "Mascara",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P41L08_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P41L08_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P41L08_226x311_0.jpg"
				},
				"parent_category_id": "CAT633",
				"path": "CAT637",
				"subCategories": []
			},
			"CAT636": {
				"category_id": "CAT636",
				"category_level": 4,
				"category_name": "Fard à Paupières",
				"category_image": {
					"LARGE_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/420x578/el_sku_P35G01_420x578_0.jpg"],
					"MEDIUM_IMAGE": ["https://www.esteelauder.fr/media/export/cms/products/308x424/el_sku_P35G01_308x424_0.jpg"],
					"SMALL_IMAGE": "https://www.esteelauder.fr/media/export/cms/products/226x311/el_sku_P35G01_226x311_0.jpg"
				},
				"parent_category_id": "CAT633",
				"path": "CAT636",
				"subCategories": []
			}
		},
		en_us: {
			"CAT570": {
			"category_id": "CAT570",
			"category_level": 1,
			"category_name": "Products",
			"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
	/*
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_Y2KP01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_Y2KP01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_Y2KP01_226x311_0.jpg"
	*/
			},
			"parent_category_id": null,
			"path": "CAT570",
			"subCategories": [{
				"category_id": "JCAT_NEW_IN",
				"category_name": "New in"
			}, {
				"category_id": "CAT681",
				"category_level": 2,
				"category_name": "Skincare",
				"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
				},
				"parent_category_id": "CAT570",
				"path": "CAT681"
			}, {
				"category_id": "CAT631",
				"category_level": 2,
				"category_name": "Makeup",
				"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
				},
				"parent_category_id": "CAT570",
				"path": "CAT631"
			}, {
				"category_id": "CAT571",
				"category_level": 2,
				"category_name": "Fragrance",
				"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
				},
				"parent_category_id": "CAT570",
				"path": "CAT571"
			}, {
				"category_id": "CAT661",
				"category_level": 2,
				"category_name": "Re-Nutriv",
				"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
				},
				"parent_category_id": "CAT570",
				"path": "CAT661"
			}, {
				"category_id": "CAT9196",
				"category_level": 2,
				"category_name": "Aerin",
				"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
				},
				"parent_category_id": "CAT570",
				"path": "CAT9196"
			}, {
				//"category_id": "CAT708",
				"category_id": "CAT1799",
				"category_level": 2,
				//"category_name": "What's New",
				"category_name": "Best-sellers",
				"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
				},
				"parent_category_id": "CAT570",
				"path": "CAT708"
			}, {
				//"category_id": "CAT708",
				"category_id": ["CAT653","CAT707","CAT630","CAT673"],
				"category_level": 2,
				//"category_name": "What's New",
				"category_name": "Sets & Gifts",
				"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
				},
				"parent_category_id": "CAT570",
				"path": "CAT708"
			}]
			},
			"CAT9196": {
			"category_id": "CAT9196",
			"category_level": 2,
			"category_name": "Aerin",
			"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
			},
			"parent_category_id": "CAT570",
			"path": "CAT9196",
			"subCategories": [{
				"category_id": "CAT19982",
				"category_level": 3,
				"category_name": "What's New",
				"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
				},
				"parent_category_id": "CAT9196",
				"path": "CAT19982"
			}, {
				"category_id": "CAT19983",
				"category_level": 3,
				"category_name": "Perfect Gifts",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RX3G01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RX3G01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RX3G01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9196",
				"path": "CAT19983"
			}, {
				"category_id": "CAT11989",
				"category_level": 3,
				//"category_name": "Aerin Fragrance",
				"category_name": "Fragrance Collection",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P0JN01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P0JN01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P0JN01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9196",
				"path": "CAT11989"
			}, {
				"category_id": "CAT19984",
				"category_level": 3,
				"category_name": "Premier Collection",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RWFK01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RWFK01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RWFK01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9196",
				"path": "CAT19984"
			}, {
				"category_id": "CAT15505",
				"category_level": 3,
				//"category_name": "AERIN Rose Collection",
				"category_name": "Rose Collection",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RNAG01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RNAG01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RNAG01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9196",
				"path": "CAT15505"
			}, {
				"category_id": "CAT12772",
				"category_level": 2,
				//"category_name": "AERIN Limited Edition",
				"category_name": "Limited Edition",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YPGR07_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YPGR07_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YPGR07_226x311_0.jpg"
				},
				"parent_category_id": "CAT9196",
				"path": "CAT12772"
			}, {
				"category_id": "CAT9262",
				"category_level": 3,
				//"category_name": "AERIN Essentials",
				"category_name": "Essentials",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RM9901_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RM9901_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RM9901_226x311_0.jpg"
				},
				"parent_category_id": "CAT9196",
				"path": "CAT9262"
			}]
			},
			"CAT12772": {
			"category_id": "CAT12772",
			"category_level": 2,
			//"category_name": "AERIN Limited Edition",
			"category_name": "Limited Edition",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YPGR07_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YPGR07_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YPGR07_226x311_0.jpg"
			},
			"parent_category_id": "CAT9196",
			"path": "CAT12772",
			"subCategories": []
			},
			"CAT19984": {
			"category_id": "CAT19984",
			"category_level": 3,
			"category_name": "Premier Collection",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RWFK01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RWFK01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RWFK01_226x311_0.jpg"
			},
			"parent_category_id": "CAT9196",
			"path": "CAT19984",
			"subCategories": []
			},
			"CAT19982": {
			"category_id": "CAT19982",
			"category_level": 3,
			"category_name": "What's New",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P0JN01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P0JN01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P0JN01_226x311_0.jpg"
			},
			"parent_category_id": "CAT9196",
			"path": "CAT19982",
			"subCategories": []
			},
			"CAT9262": {
			"category_id": "CAT9262",
			"category_level": 3,
			"category_name": "Essentials",
			//"category_name": "AERIN Essentials",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RM9901_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RM9901_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RM9901_226x311_0.jpg"
			},
			"parent_category_id": "CAT9196",
			"path": "CAT9262",
			"subCategories": []
			},
			"CAT15505": {
			"category_id": "CAT15505",
			"category_level": 3,
			"category_name": "AERIN Rose Collection",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RNAG01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RNAG01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RNAG01_226x311_0.jpg"
			},
			"parent_category_id": "CAT9196",
			"path": "CAT15505",
			"subCategories": []
			},
			"CAT19983": {
			"category_id": "CAT19983",
			"category_level": 3,
			"category_name": "Perfect Gifts",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RX3G01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RX3G01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RX3G01_226x311_0.jpg"
			},
			"parent_category_id": "CAT9196",
			"path": "CAT19983",
			"subCategories": []
			},
			"CAT11989": {
			"category_id": "CAT11989",
			"category_level": 3,
			"category_name": "Aerin Fragrance",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P0JN01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P0JN01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P0JN01_226x311_0.jpg"
			},
			"parent_category_id": "CAT9196",
			"path": "CAT11989",
			"subCategories": []
			},
			"CAT708": {
			"category_id": "CAT708",
			"category_level": 2,
			"category_name": "What's New",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R41204_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R41204_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R41204_226x311_0.jpg"
			},
			"parent_category_id": "CAT570",
			"path": "CAT708",
			"subCategories": [{
				"category_id": "CAT15489",
				"category_level": 3,
				"category_name": "What's New - Makeup",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P7F401_420x578_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P7F401_420x578_1.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P7F401_308x424_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P7F401_308x424_1.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P7F401_226x311_0.jpg"
				},
				"parent_category_id": "CAT708",
				"path": "CAT15489"
			}, {
				"category_id": "CAT15490",
				"category_level": 3,
				"category_name": "What's New - Skincare",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RY9801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RY9801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RY9801_226x311_0.jpg"
				},
				"parent_category_id": "CAT708",
				"path": "CAT15490"
			}, {
				"category_id": "CAT14324",
				"category_level": 3,
				"category_name": "Gifts",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_W8R0Q8_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_W8R0Q8_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_W8R0Q8_226x311_0.jpg"
				},
				"parent_category_id": "CAT708",
				"path": "CAT14324"
			}, {
				"category_id": "CAT15488",
				"category_level": 3,
				"category_name": "What's New - Fragrance",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P2AWQ8_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P2AWQ8_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P2AWQ8_226x311_0.jpg"
				},
				"parent_category_id": "CAT708",
				"path": "CAT15488"
			}, {
				"category_id": "CAT1799",
				"category_level": 3,
				"category_name": "Best Sellers",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1G5Y15_420x578_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1G5Y15_420x578_1.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1G5Y15_308x424_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1G5Y15_308x424_1.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_1G5Y15_226x311_0.jpg"
				},
				"parent_category_id": "CAT708",
				"path": "CAT1799"
			}]
			},
			"CAT15489": {
			"category_id": "CAT15489",
			"category_level": 3,
			"category_name": "What's New - Makeup",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P7F401_420x578_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P7F401_420x578_1.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P7F401_308x424_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P7F401_308x424_1.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P7F401_226x311_0.jpg"
			},
			"parent_category_id": "CAT708",
			"path": "CAT15489",
			"subCategories": []
			},
			"CAT15490": {
			"category_id": "CAT15490",
			"category_level": 3,
			"category_name": "What's New - Skincare",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RY9801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RY9801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RY9801_226x311_0.jpg"
			},
			"parent_category_id": "CAT708",
			"path": "CAT15490",
			"subCategories": []
			},
			"CAT14324": {
			"category_id": "CAT14324",
			"category_level": 3,
			"category_name": "Gifts",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_W8R0Q8_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_W8R0Q8_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_W8R0Q8_226x311_0.jpg"
			},
			"parent_category_id": "CAT708",
			"path": "CAT14324",
			"subCategories": []
			},
			"CAT15488": {
			"category_id": "CAT15488",
			"category_level": 3,
			"category_name": "What's New - Fragrance",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P2AWQ8_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P2AWQ8_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P2AWQ8_226x311_0.jpg"
			},
			"parent_category_id": "CAT708",
			"path": "CAT15488",
			"subCategories": []
			},
			"CAT1799": {
			"category_id": "CAT1799",
			"category_level": 3,
			"category_name": "Best Sellers",
			"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
			},
			"parent_category_id": "CAT708",
			"path": "CAT1799",
			"subCategories": []
			},
			"CAT571": {
			"category_id": "CAT571",
			"category_level": 2,
			"category_name": "Fragrance",
			"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
			},
			"parent_category_id": "CAT570",
			"path": "CAT571",
			"subCategories": [{
				"category_id": "CAT12850",
				"category_level": 3,
				"category_name": "For Women",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
				},
				"parent_category_id": "CAT571",
				"path": "CAT12850"
			}, {
				"category_id": "CAT8257",
				"category_level": 3,
				"category_name": "For Men",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_11A501_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_11A501_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_11A501_226x311_0.jpg"
				},
				"parent_category_id": "CAT571",
				"path": "CAT8257"
			}]
			},
			"CAT12850": {
			"category_id": "CAT12850",
			"category_level": 3,
			"category_name": "For Women",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
			},
			"parent_category_id": "CAT571",
			"path": "CAT12850",
			"subCategories": [{
				"category_id": ["CAT12851","CAT11564"],
				"category_level": 4,
				"category_name": "Modern Muse",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RKG201_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RKG201_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RKG201_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12851"
			}, {
				"category_id": ["CAT12852","CAT9780"],
				"category_level": 4,
				"category_name": "Beautiful",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_480502_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_480502_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_480502_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12852"
			}, {
				"category_id": ["CAT12853","CAT9782"],
				"category_level": 4,
				"category_name": "Pleasures",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_703201_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_703201_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_703201_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12853"
			}, {
				"category_id": ["CAT12854","CAT9784"],
				"category_level": 4,
				"category_name": "Sensuous",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9TMJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9TMJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9TMJ01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12854"
			}, {
				"category_id": "CAT9783",
				"category_level": 4,
				"category_name": "Aerin Lauder's Private Collection",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9A9J01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9A9J01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9A9J01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9783"
			}, {
				"category_id": ["CAT12968","CAT12898"],
				"category_level": 4,
				"category_name": "Knowing",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12968"
			}, {
				"category_id": "CAT13093",
				"category_level": 4,
				"category_name": "Youth-Dew",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_093401_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_093401_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_093401_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT13093"
			}, {
				"category_id": "CAT9786",
				"category_level": 4,
				"category_name": "White Linen",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_99FE01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_99FE01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_99FE01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9786"
			}, {
				"category_id": "CAT12855",
				"category_level": 4,
				"category_name": "Private Collection",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9A9J01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9A9J01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9A9J01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12850",
				"path": "CAT12855"
			}, {
				"category_id": "CAT14517",
				"category_level": 4,
				"category_name": "The House of Estée Lauder",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YX3601_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YX3601_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YX3601_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT14517"
			}, {
				"category_id": "CAT14518",
				"category_level": 4,
				"category_name": "Mystique",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WNK601_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WNK601_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WNK601_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT14518"
			}]
			},
			"CAT12970": {
			"category_id": "CAT12970",
			"category_level": 4,
			"category_name": "Classics",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YX3501_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YX3501_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YX3501_226x311_0.jpg"
			},
			"parent_category_id": "CAT12850",
			"path": "CAT12970",
			"subCategories": []
			},
			"CAT12854": {
			"category_id": "CAT12854",
			"category_level": 4,
			"category_name": "Sensuous",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9TMJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9TMJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9TMJ01_226x311_0.jpg"
			},
			"parent_category_id": "CAT12850",
			"path": "CAT12854",
			"subCategories": []
			},
			"CAT12851": {
			"category_id": "CAT12851",
			"category_level": 4,
			"category_name": "Modern Muse",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RKG201_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RKG201_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RKG201_226x311_0.jpg"
			},
			"parent_category_id": "CAT12850",
			"path": "CAT12851",
			"subCategories": []
			},
			"CAT12852": {
			"category_id": "CAT12852",
			"category_level": 4,
			"category_name": "Beautiful",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_480502_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_480502_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_480502_226x311_0.jpg"
			},
			"parent_category_id": "CAT12850",
			"path": "CAT12852",
			"subCategories": []
			},
			"CAT12855": {
			"category_id": "CAT12855",
			"category_level": 4,
			"category_name": "Private Collection",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9A9J01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9A9J01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9A9J01_226x311_0.jpg"
			},
			"parent_category_id": "CAT12850",
			"path": "CAT12855",
			"subCategories": []
			},
			"CAT12853": {
			"category_id": "CAT12853",
			"category_level": 4,
			"category_name": "Pleasures",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_703201_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_703201_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_703201_226x311_0.jpg"
			},
			"parent_category_id": "CAT12850",
			"path": "CAT12853",
			"subCategories": []
			},
			"CAT12968": {
			"category_id": "CAT12968",
			"category_level": 4,
			"category_name": "Knowing",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
			},
			"parent_category_id": "CAT12850",
			"path": "CAT12968",
			"subCategories": []
			},
			"CAT8257": {
			"category_id": "CAT8257",
			"category_level": 3,
			"category_name": "For Men",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_11A501_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_11A501_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_11A501_226x311_0.jpg"
			},
			"parent_category_id": "CAT571",
			"path": "CAT8257",
			"subCategories": [{
				"category_id": "CAT8259",
				"category_level": 4,
				"category_name": "Lauder",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_181601_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_181601_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_181601_226x311_0.jpg"
				},
				"parent_category_id": "CAT8257",
				"path": "CAT8259"
			}, {
				"category_id": "CAT8260",
				"category_level": 4,
				"category_name": "Pleasures",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_11A501_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_11A501_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_11A501_226x311_0.jpg"
				},
				"parent_category_id": "CAT8257",
				"path": "CAT8260"
			}, {
				"category_id": "CAT8258",
				"category_level": 4,
				"category_name": "Intuition",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1MJF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1MJF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_1MJF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT8257",
				"path": "CAT8258"
			}]
			},
			"CAT8259": {
			"category_id": "CAT8259",
			"category_level": 4,
			"category_name": "Lauder",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_181601_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_181601_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_181601_226x311_0.jpg"
			},
			"parent_category_id": "CAT8257",
			"path": "CAT8259",
			"subCategories": []
			},
			"CAT8260": {
			"category_id": "CAT8260",
			"category_level": 4,
			"category_name": "Pleasures",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_11A501_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_11A501_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_11A501_226x311_0.jpg"
			},
			"parent_category_id": "CAT8257",
			"path": "CAT8260",
			"subCategories": []
			},
			"CAT8258": {
			"category_id": "CAT8258",
			"category_level": 4,
			"category_name": "Intuition",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1MJF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1MJF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_1MJF01_226x311_0.jpg"
			},
			"parent_category_id": "CAT8257",
			"path": "CAT8258",
			"subCategories": []
			},
			"CAT8261": {
			"category_id": "CAT8261",
			"category_level": 3,
			"category_name": "Collections",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YF3101_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YF3101_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YF3101_226x311_0.jpg"
			},
			"parent_category_id": "CAT571",
			"path": "CAT8261",
			"subCategories": [{
				"category_id": "CAT11564",
				"category_level": 4,
				"category_name": "Modern Muse",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YF3101_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YF3101_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YF3101_226x311_0.jpg"
				},
				"parent_category_id": "CAT8261",
				"path": "CAT11564"
			}]
			},
			"CAT11564": {
			"category_id": "CAT11564",
			"category_level": 4,
			"category_name": "Modern Muse",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YF3101_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YF3101_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YF3101_226x311_0.jpg"
			},
			"parent_category_id": "CAT8261",
			"path": "CAT11564",
			"subCategories": []
			},
			"CAT1283": {
			"category_id": "CAT1283",
			"category_level": 3,
			"category_name": "Tools & More",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P2AWQ8_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P2AWQ8_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P2AWQ8_226x311_0.jpg"
			},
			"parent_category_id": "CAT571",
			"path": "CAT1283",
			"subCategories": [{
				"category_id": "CAT630",
				"category_level": 4,
				"category_name": "Sets & Gifts",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P2AWQ8_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P2AWQ8_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P2AWQ8_226x311_0.jpg"
				},
				"parent_category_id": "CAT1283",
				"path": "CAT630"
			}]
			},
			"CAT630": {
			"category_id": "CAT630",
			"category_level": 4,
			"category_name": "Sets & Gifts",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P2AWQ8_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P2AWQ8_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P2AWQ8_226x311_0.jpg"
			},
			"parent_category_id": "CAT1283",
			"path": "CAT630",
			"subCategories": []
			},
			"CAT9779": {
			"category_id": "CAT9779",
			"category_level": 3,
			"category_name": "For Women",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RCL701_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RCL701_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RCL701_226x311_0.jpg"
			},
			"parent_category_id": "CAT571",
			"path": "CAT9779",
			"subCategories": [{
				"category_id": "CAT9782",
				"category_level": 4,
				"category_name": "Estée Lauder Pleasures",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_707301_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_707301_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_707301_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9782"
			}, {
				"category_id": "CAT14517",
				"category_level": 4,
				"category_name": "House of Estée",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YX3601_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YX3601_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YX3601_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT14517"
			}, {
				"category_id": "CAT12898",
				"category_level": 4,
				"category_name": "Knowing",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT12898"
			}, {
				"category_id": "CAT9786",
				"category_level": 4,
				"category_name": "Pure White Linen",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_99FE01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_99FE01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_99FE01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9786"
			}, {
				"category_id": "CAT9785",
				"category_level": 4,
				"category_name": "Classics",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YX3501_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YX3501_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YX3501_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9785"
			}, {
				"category_id": "CAT13093",
				"category_level": 4,
				"category_name": "Youth-Dew",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_093401_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_093401_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_093401_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT13093"
			}, {
				"category_id": "CAT9780",
				"category_level": 4,
				"category_name": "Beautiful",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_482902_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_482902_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_482902_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9780"
			}, {
				"category_id": "CAT9784",
				"category_level": 4,
				"category_name": "Estée Lauder Sensuous",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9TMK01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9TMK01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9TMK01_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9784"
			}, {
				"category_id": "CAT14518",
				"category_level": 4,
				"category_name": "Mystique",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WNK601_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WNK601_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WNK601_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT14518"
			}, {
				"category_id": "CAT9781",
				"category_level": 4,
				"category_name": "Bronze Goddess",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YER202_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YER202_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YER202_226x311_0.jpg"
				},
				"parent_category_id": "CAT9779",
				"path": "CAT9781"
			}]
			},
			"CAT9782": {
			"category_id": "CAT9782",
			"category_level": 4,
			"category_name": "Estée Lauder Pleasures",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_707301_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_707301_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_707301_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT9782",
			"subCategories": []
			},
			"CAT14517": {
			"category_id": "CAT14517",
			"category_level": 4,
			"category_name": "The House of Estée Lauder",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YX3601_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YX3601_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YX3601_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT14517",
			"subCategories": []
			},
			"CAT12898": {
			"category_id": "CAT12898",
			"category_level": 4,
			"category_name": "Knowing",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_440801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_440801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_440801_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT12898",
			"subCategories": []
			},
			"CAT9786": {
			"category_id": "CAT9786",
			"category_level": 4,
			"category_name": "White Linen",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_99FE01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_99FE01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_99FE01_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT9786",
			"subCategories": []
			},
			"CAT9785": {
			"category_id": "CAT9785",
			"category_level": 4,
			"category_name": "Classics",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YX3501_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YX3501_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YX3501_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT9785",
			"subCategories": []
			},
			"CAT13093": {
			"category_id": "CAT13093",
			"category_level": 4,
			"category_name": "Youth-Dew",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_093401_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_093401_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_093401_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT13093",
			"subCategories": []
			},
			"CAT9780": {
			"category_id": "CAT9780",
			"category_level": 4,
			"category_name": "Beautiful",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_482902_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_482902_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_482902_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT9780",
			"subCategories": []
			},
			"CAT9784": {
			"category_id": "CAT9784",
			"category_level": 4,
			"category_name": "Estée Lauder Sensuous",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9TMK01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9TMK01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9TMK01_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT9784",
			"subCategories": []
			},
			"CAT14518": {
			"category_id": "CAT14518",
			"category_level": 4,
			"category_name": "Mystique",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WNK601_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WNK601_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WNK601_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT14518",
			"subCategories": []
			},
			"CAT9783": {
			"category_id": "CAT9783",
			"category_level": 4,
			"category_name": "Aerin Lauder's Private Collection",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9A9J01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9A9J01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9A9J01_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT9783",
			"subCategories": []
			},
			"CAT9781": {
			"category_id": "CAT9781",
			"category_level": 4,
			"category_name": "Bronze Goddess",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YER202_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YER202_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YER202_226x311_0.jpg"
			},
			"parent_category_id": "CAT9779",
			"path": "CAT9781",
			"subCategories": []
			},
			"CAT661": {
			"category_id": "CAT661",
			"category_level": 2,
			"category_name": "Re-Nutriv",
			"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
			},
			"parent_category_id": "CAT570",
			"path": "CAT661",
			"subCategories": [{
				"category_id": "CAT662",
				"category_level": 3,
				"category_name": "Collections",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R9EF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R9EF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R9EF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT661",
				"path": "CAT662"
			}, {
				"category_id": "CAT674",
				"category_level": 3,
				"category_name": "Skincare",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RLMF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RLMF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RLMF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT661",
				"path": "CAT674"
			}, {
				"category_id": "CAT669",
				"category_level": 3,
				"category_name": "Makeup",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YH0L01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YH0L01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YH0L01_226x311_0.jpg"
				},
				"parent_category_id": "CAT661",
				"path": "CAT669"
			}, {
				"category_id": "CAT673",
				"category_level": 3,
				"category_name": "Sets & Gifts",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RWG301_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RWG301_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RWG301_226x311_0.jpg"
				},
				"parent_category_id": "CAT661",
				"path": "CAT673"
			}]
			},
			"CAT673": {
			"category_id": "CAT673",
			"category_level": 3,
			"category_name": "Sets & Gifts",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RWG301_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RWG301_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RWG301_226x311_0.jpg"
			},
			"parent_category_id": "CAT661",
			"path": "CAT673",
			"subCategories": []
			},
			"CAT669": {
			"category_id": "CAT669",
			"category_level": 3,
			"category_name": "Makeup",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YH0L01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YH0L01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YH0L01_226x311_0.jpg"
			},
			"parent_category_id": "CAT661",
			"path": "CAT669",
			"subCategories": [{
				"category_id": "CAT670",
				"category_level": 4,
				"category_name": "Concealer",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YH3001_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YH3001_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YH3001_226x311_0.jpg"
				},
				"parent_category_id": "CAT669",
				"path": "CAT670"
			}, {
				"category_id": "CAT671",
				"category_level": 4,
				"category_name": "Foundation",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YH0L01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YH0L01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YH0L01_226x311_0.jpg"
				},
				"parent_category_id": "CAT669",
				"path": "CAT671"
			}]
			},
			"CAT670": {
			"category_id": "CAT670",
			"category_level": 4,
			"category_name": "Concealer",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YH3001_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YH3001_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YH3001_226x311_0.jpg"
			},
			"parent_category_id": "CAT669",
			"path": "CAT670",
			"subCategories": []
			},
			"CAT671": {
			"category_id": "CAT671",
			"category_level": 4,
			"category_name": "Foundation",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YH0L01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YH0L01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YH0L01_226x311_0.jpg"
			},
			"parent_category_id": "CAT669",
			"path": "CAT671",
			"subCategories": []
			},
			"CAT662": {
			"category_id": "CAT662",
			"category_level": 3,
			"category_name": "Collections",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R9EF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R9EF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R9EF01_226x311_0.jpg"
			},
			"parent_category_id": "CAT661",
			"path": "CAT662",
			"subCategories": [{
				"category_id": "JCAT_ULTIMATE_DIAMOND",
				"category_name": "Ultimate Diamond",
			}, {
				"category_id": "CAT12971",
				"category_level": 4,
				"category_name": "Ultimate Lift",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RLMF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RLMF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RLMF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT12971"
			}, {
				"category_id": "CAT11855",
				"category_level": 4,
				"category_name": "Radiant White Age-Renewal",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R9EF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R9EF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R9EF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT11855"
			}, {
				"category_id": "CAT9942",
				"category_level": 4,
				"category_name": "Intensive Age Renewal",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_Y75001_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_Y75001_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_Y75001_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT9942"
			}, {
				"category_id": "CAT12972",
				"category_level": 4,
				"category_name": "Replenishing Comfort",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WYMJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WYMJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WYMJ01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT12972"
			}, {
				"category_id": "CAT665",
				"category_level": 4,
				"category_name": "Re-Creation",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WP0F01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WP0F01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WP0F01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT665"
			}, {
				"category_id": "CAT663",
				"category_level": 4,
				"category_name": "Classic Re-Nutriv",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_168401_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_168401_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_168401_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT663"
			}, {
				"category_id": "CAT667",
				"category_level": 4,
				"category_name": "Ultimate Lift",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RT8N01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RT8N01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RT8N01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT667"
			}, {
				"category_id": "CAT664",
				"category_level": 4,
				"category_name": "Intensive Age Renewal",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1J2T01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1J2T01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_1J2T01_226x311_0.jpg"
				},
				"parent_category_id": "CAT662",
				"path": "CAT664"
			}]
			},
			"CAT11855": {
			"category_id": "CAT11855",
			"category_level": 4,
			"category_name": "Radiant White Age-Renewal",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R9EF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R9EF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R9EF01_226x311_0.jpg"
			},
			"parent_category_id": "CAT662",
			"path": "CAT11855",
			"subCategories": []
			},
			"CAT9942": {
			"category_id": "CAT9942",
			"category_level": 4,
			"category_name": "Intensive Age Renewal",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_Y75001_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_Y75001_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_Y75001_226x311_0.jpg"
			},
			"parent_category_id": "CAT662",
			"path": "CAT9942",
			"subCategories": []
			},
			"CAT663": {
			"category_id": "CAT663",
			"category_level": 4,
			"category_name": "Classic Re-Nutriv",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_168401_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_168401_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_168401_226x311_0.jpg"
			},
			"parent_category_id": "CAT662",
			"path": "CAT663",
			"subCategories": []
			},
			"CAT12972": {
			"category_id": "CAT12972",
			"category_level": 4,
			"category_name": "Replenishing Comfort",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WYMJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WYMJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WYMJ01_226x311_0.jpg"
			},
			"parent_category_id": "CAT662",
			"path": "CAT12972",
			"subCategories": []
			},
			"CAT12971": {
			"category_id": "CAT12971",
			"category_level": 4,
			"category_name": "Ultimate Lift",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RLMF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RLMF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RLMF01_226x311_0.jpg"
			},
			"parent_category_id": "CAT662",
			"path": "CAT12971",
			"subCategories": []
			},
			"CAT665": {
			"category_id": "CAT665",
			"category_level": 4,
			"category_name": "Re-Creation",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WP0F01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WP0F01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WP0F01_226x311_0.jpg"
			},
			"parent_category_id": "CAT662",
			"path": "CAT665",
			"subCategories": []
			},
			"CAT667": {
			"category_id": "CAT667",
			"category_level": 4,
			"category_name": "Ultimate Lift",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RT8N01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RT8N01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RT8N01_226x311_0.jpg"
			},
			"parent_category_id": "CAT662",
			"path": "CAT667",
			"subCategories": []
			},
			"CAT664": {
			"category_id": "CAT664",
			"category_level": 4,
			"category_name": "Intensive Age Renewal",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1J2T01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1J2T01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_1J2T01_226x311_0.jpg"
			},
			"parent_category_id": "CAT662",
			"path": "CAT664",
			"subCategories": []
			},
			"CAT674": {
			"category_id": "CAT674",
			"category_level": 3,
			"category_name": "Skincare",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RLMF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RLMF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RLMF01_226x311_0.jpg"
			},
			"parent_category_id": "CAT661",
			"path": "CAT674",
			"subCategories": [{
				"category_id": "CAT677",
				"category_level": 4,
				"category_name": "Face Creme",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RH7T01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RH7T01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RH7T01_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT677"
			}, {
				"category_id": "CAT676",
				"category_level": 4,
				"category_name": "Eye Cremes",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YGA801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YGA801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YGA801_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT676"
			}, {
				"category_id": "CAT679",
				"category_level": 4,
				"category_name": "Repair Serums",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WHA201_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WHA201_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WHA201_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT679"
			}, {
				"category_id": "CAT675",
				"category_level": 4,
				"category_name": "Cleanser/Toner",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RLMF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RLMF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RLMF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT675"
			}, {
				"category_id": "CAT678",
				"category_level": 4,
				"category_name": "Hand/Body",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9PKK01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9PKK01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9PKK01_226x311_0.jpg"
				},
				"parent_category_id": "CAT674",
				"path": "CAT678"
			}]
			},
			"CAT680": {
			"category_id": "CAT680",
			"category_level": 4,
			"category_name": "Targeted Treatments",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_Y2KR01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_Y2KR01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_Y2KR01_226x311_0.jpg"
			},
			"parent_category_id": "CAT674",
			"path": "CAT680",
			"subCategories": []
			},
			"CAT678": {
			"category_id": "CAT678",
			"category_level": 4,
			"category_name": "Hand/Body",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9PKK01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9PKK01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9PKK01_226x311_0.jpg"
			},
			"parent_category_id": "CAT674",
			"path": "CAT678",
			"subCategories": []
			},
			"CAT676": {
			"category_id": "CAT676",
			"category_level": 4,
			"category_name": "Eye Cremes",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YGA801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YGA801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YGA801_226x311_0.jpg"
			},
			"parent_category_id": "CAT674",
			"path": "CAT676",
			"subCategories": []
			},
			"CAT675": {
			"category_id": "CAT675",
			"category_level": 4,
			"category_name": "Cleanser/Toner",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RLMF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RLMF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RLMF01_226x311_0.jpg"
			},
			"parent_category_id": "CAT674",
			"path": "CAT675",
			"subCategories": []
			},
			"CAT679": {
			"category_id": "CAT679",
			"category_level": 4,
			"category_name": "Repair Serums",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WHA201_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WHA201_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WHA201_226x311_0.jpg"
			},
			"parent_category_id": "CAT674",
			"path": "CAT679",
			"subCategories": []
			},
			"CAT677": {
			"category_id": "CAT677",
			"category_level": 4,
			"category_name": "Face Creme",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RH7T01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RH7T01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RH7T01_226x311_0.jpg"
			},
			"parent_category_id": "CAT674",
			"path": "CAT677",
			"subCategories": [{
				"category_id": "CAT2399",
				"category_level": 5,
				"category_name": "Luxury Large Sizes",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_168001_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_168001_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_168001_226x311_0.jpg"
				},
				"parent_category_id": "CAT677",
				"path": "CAT2399"
			}]
			},
			"CAT2399": {
			"category_id": "CAT2399",
			"category_level": 5,
			"category_name": "Luxury Large Sizes",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_168001_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_168001_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_168001_226x311_0.jpg"
			},
			"parent_category_id": "CAT677",
			"path": "CAT2399",
			"subCategories": []
			},
			"CAT631": {
			"category_id": "CAT631",
			"category_level": 2,
			"category_name": "Makeup",
			"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
			},
			"parent_category_id": "CAT570",
			"path": "CAT631",
			"subCategories": [{
				"category_id": "CAT638",
				"category_level": 3,
				"category_name": "Face",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_REP801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_REP801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_REP801_226x311_0.jpg"
				},
				"parent_category_id": "CAT631",
				"path": "CAT638"
			}, {
				"category_id": "CAT633",
				"category_level": 3,
				//"category_name": "Eyes",
				"category_name": "Eye",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R8G001_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R8G001_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R8G001_226x311_0.jpg"
				},
				"parent_category_id": "CAT631",
				"path": "CAT633"
			}, {
				"category_id": "CAT646",
				"category_level": 3,
				//"category_name": "Lips",
				"category_name": "Lip",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R41204_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R41204_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R41204_226x311_0.jpg"
				},
				"parent_category_id": "CAT631",
				"path": "CAT646"
			}, {
				"category_id": "CAT12882",
				"category_level": 3,
				"category_name": "Accessories",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YNAE01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YNAE01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YNAE01_226x311_0.jpg"
				},
				"parent_category_id": "CAT631",
				"path": "CAT12882"
			}, {
				"category_id": "JCAT_MAKEUP_COLLECTIONS",
				"category_name": "Collections",
			}]
			},
			"CAT654": {
			"category_id": "CAT654",
			"category_level": 3,
			"category_name": "Tools & More",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R8KJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R8KJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R8KJ01_226x311_0.jpg"
			},
			"parent_category_id": "CAT631",
			"path": "CAT654",
			"subCategories": [{
				"category_id": "CAT653",
				"category_level": 4,
				"category_name": "Sets & Gifts",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YJRR68_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YJRR68_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YJRR68_226x311_0.jpg"
				},
				"parent_category_id": "CAT654",
				"path": "CAT653"
			}]
			},
			"CAT653": {
			"category_id": "CAT653",
			"category_level": 4,
			"category_name": "Sets & Gifts",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YJRR68_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YJRR68_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YJRR68_226x311_0.jpg"
			},
			"parent_category_id": "CAT654",
			"path": "CAT653",
			"subCategories": []
			},
			"CAT12882": {
			"category_id": "CAT12882",
			"category_level": 3,
			"category_name": "Accessories",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YNAE01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YNAE01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YNAE01_226x311_0.jpg"
			},
			"parent_category_id": "CAT631",
			"path": "CAT12882",
			"subCategories": [{
				"category_id": "CAT12883",
				"category_level": 4,
				"category_name": "Brushes & Tools",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YNAE01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YNAE01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YNAE01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12882",
				"path": "CAT12883"
			}, {
				"category_id": "CAT8316",
				"category_level": 4,
				"category_name": "Nail Lacquer",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WG63GH_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WG63GH_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WG63GH_226x311_0.jpg"
				},
				"parent_category_id": "CAT8315",
				"path": "CAT8316",
			}, {
				"category_id": "CAT12884",
				"category_level": 4,
				"category_name": "Refills",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1HLL01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1HLL01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_1HLL01_226x311_0.jpg"
				},
				"parent_category_id": "CAT12882",
				"path": "CAT12884"
			}]
			},
			"CAT12884": {
			"category_id": "CAT12884",
			"category_level": 4,
			"category_name": "Refills",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1HLL01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1HLL01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_1HLL01_226x311_0.jpg"
			},
			"parent_category_id": "CAT12882",
			"path": "CAT12884",
			"subCategories": []
			},
			"CAT12883": {
			"category_id": "CAT12883",
			"category_level": 4,
			"category_name": "Brushes & Tools",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YNAE01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YNAE01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YNAE01_226x311_0.jpg"
			},
			"parent_category_id": "CAT12882",
			"path": "CAT12883",
			"subCategories": []
			},
			"CAT8315": {
			"category_id": "CAT8315",
			"category_level": 3,
			"category_name": "Nail",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WG63GH_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WG63GH_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WG63GH_226x311_0.jpg"
			},
			"parent_category_id": "CAT631",
			"path": "CAT8315",
			"subCategories": [{
				"category_id": "CAT8316",
				"category_level": 4,
				"category_name": "Nail Lacquer",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WG63GH_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WG63GH_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WG63GH_226x311_0.jpg"
				},
				"parent_category_id": "CAT8315",
				"path": "CAT8316"
			}]
			},
			"CAT8316": {
			"category_id": "CAT8316",
			"category_level": 4,
			"category_name": "Nail Lacquer",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_WG63GH_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_WG63GH_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_WG63GH_226x311_0.jpg"
			},
			"parent_category_id": "CAT8315",
			"path": "CAT8316",
			"subCategories": []
			},
			"CAT646": {
			"category_id": "CAT646",
			"category_level": 3,
			"category_name": "Lip",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R41204_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R41204_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R41204_226x311_0.jpg"
			},
			"parent_category_id": "CAT631",
			"path": "CAT646",
			"subCategories": [{
				"category_id": "CAT649",
				"category_level": 4,
				"category_name": "Lipstick",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YJRR54_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YJRR54_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YJRR54_226x311_0.jpg"
				},
				"parent_category_id": "CAT646",
				"path": "CAT649"
			}, {
				"category_id": "CAT21843",
				"category_level": 4,
				"category_name": "Liquid Lip",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P36505_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P36505_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P36505_226x311_0.jpg"
				},
				"parent_category_id": "CAT646",
				"path": "CAT21843"
			}, {
				"category_id": "CAT647",
				"category_level": 4,
				"category_name": "Lip Gloss",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R41204_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R41204_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R41204_226x311_0.jpg"
				},
				"parent_category_id": "CAT646",
				"path": "CAT647"
			}, {
				"category_id": "CAT648",
				"category_level": 4,
				"category_name": "Lip Pencil",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_W3E116_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_W3E116_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_W3E116_226x311_0.jpg"
				},
				"parent_category_id": "CAT646",
				"path": "CAT648"
			}]
			},
			"CAT21843": {
			"category_id": "CAT21843",
			"category_level": 4,
			"category_name": "Liquid Lip",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P36505_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P36505_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P36505_226x311_0.jpg"
			},
			"parent_category_id": "CAT646",
			"path": "CAT21843",
			"subCategories": []
			},
			"CAT647": {
			"category_id": "CAT647",
			"category_level": 4,
			"category_name": "Lip Gloss",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R41204_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R41204_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R41204_226x311_0.jpg"
			},
			"parent_category_id": "CAT646",
			"path": "CAT647",
			"subCategories": []
			},
			"CAT648": {
			"category_id": "CAT648",
			"category_level": 4,
			"category_name": "Lip Pencil",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_W3E116_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_W3E116_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_W3E116_226x311_0.jpg"
			},
			"parent_category_id": "CAT646",
			"path": "CAT648",
			"subCategories": []
			},
			"CAT649": {
			"category_id": "CAT649",
			"category_level": 4,
			"category_name": "Lipstick",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YJRR54_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YJRR54_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YJRR54_226x311_0.jpg"
			},
			"parent_category_id": "CAT646",
			"path": "CAT649",
			"subCategories": []
			},
			"CAT633": {
			"category_id": "CAT633",
			"category_level": 3,
			"category_name": "Eye",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R8G001_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R8G001_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R8G001_226x311_0.jpg"
			},
			"parent_category_id": "CAT631",
			"path": "CAT633",
			"subCategories": [{
				"category_id": "CAT634",
				"category_level": 4,
				"category_name": "Brows",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RH8G05_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RH8G05_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RH8G05_226x311_0.jpg"
				},
				"parent_category_id": "CAT633",
				"path": "CAT634"
			}, {
				"category_id": "CAT635",
				"category_level": 4,
				"category_name": "Eyeliner",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R71R06_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R71R06_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R71R06_226x311_0.jpg"
				},
				"parent_category_id": "CAT633",
				"path": "CAT635"
			}, {
				"category_id": "CAT636",
				"category_level": 4,
				"category_name": "Eyeshadow",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P7F401_420x578_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P7F401_420x578_1.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P7F401_308x424_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P7F401_308x424_1.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P7F401_226x311_0.jpg"
				},
				"parent_category_id": "CAT633",
				"path": "CAT636"
			}, {
				"category_id": "CAT637",
				"category_level": 4,
				"category_name": "Mascara",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RJMH01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RJMH01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RJMH01_226x311_0.jpg"
				},
				"parent_category_id": "CAT633",
				"path": "CAT637"
			}]
			},
			"CAT636": {
			"category_id": "CAT636",
			"category_level": 4,
			"category_name": "Eyeshadow",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P7F401_420x578_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P7F401_420x578_1.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P7F401_308x424_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P7F401_308x424_1.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P7F401_226x311_0.jpg"
			},
			"parent_category_id": "CAT633",
			"path": "CAT636",
			"subCategories": []
			},
			"CAT637": {
			"category_id": "CAT637",
			"category_level": 4,
			"category_name": "Mascara",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RJMH01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RJMH01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RJMH01_226x311_0.jpg"
			},
			"parent_category_id": "CAT633",
			"path": "CAT637",
			"subCategories": []
			},
			"CAT634": {
			"category_id": "CAT634",
			"category_level": 4,
			"category_name": "Brows",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RH8G05_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RH8G05_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RH8G05_226x311_0.jpg"
			},
			"parent_category_id": "CAT633",
			"path": "CAT634",
			"subCategories": []
			},
			"CAT635": {
			"category_id": "CAT635",
			"category_level": 4,
			"category_name": "Eyeliner",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R71R06_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R71R06_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R71R06_226x311_0.jpg"
			},
			"parent_category_id": "CAT633",
			"path": "CAT635",
			"subCategories": []
			},
			"CAT638": {
			"category_id": "CAT638",
			"category_level": 3,
			"category_name": "Face",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_REP801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_REP801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_REP801_226x311_0.jpg"
			},
			"parent_category_id": "CAT631",
			"path": "CAT638",
			"subCategories": [{
				"category_id": "CAT643",
				"category_level": 4,
				"category_name": "Foundation",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1G5Y15_420x578_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1G5Y15_420x578_1.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1G5Y15_308x424_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1G5Y15_308x424_1.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_1G5Y15_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT643"
			}, {
				"category_id": "CAT12367",
				"category_level": 4,
				"category_name": "BB & CC Creme",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_Y4PJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_Y4PJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_Y4PJ01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT12367",
				"subCategories": []
			}, {
				"category_id": "CAT639",
				"category_level": 4,
				"category_name": "Blush",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R66C21_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R66C21_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R66C21_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT639"
			}, {
				"category_id": "CAT640",
				"category_level": 4,
				"category_name": "Bronzer",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RRK302_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RRK302_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RRK302_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT640"
			}, {
				"category_id": "CAT641",
				"category_level": 4,
				"category_name": "Compact",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RACC02_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RACC02_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RACC02_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT641"
			}, {
				"category_id": "CAT642",
				"category_level": 4,
				"category_name": "Concealer",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P1PA01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P1PA01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P1PA01_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT642"
			}, {
				"category_id": "JCAT_COLOUR_CORRECTOR",
				"category_level": 4,
				"category_name": "Colour Corrector",
			}, {
				"category_id": "CAT19981",
				"category_level": 4,
				"category_name": "Highlighter",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RRK403_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RRK403_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RRK403_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT19981"
			}, {
				"category_id": "CAT644",
				"category_level": 4,
				"category_name": "Powder",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P1JC01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P1JC01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P1JC01_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT644"
			}, {
				"category_id": "CAT1473",
				"category_level": 4,
				"category_name": "Primer",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RMY201_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RMY201_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RMY201_226x311_0.jpg"
				},
				"parent_category_id": "CAT638",
				"path": "CAT1473"
			}]
			},
			"CAT19981": {
			"category_id": "CAT19981",
			"category_level": 4,
			"category_name": "Highlighter",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RRK403_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RRK403_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RRK403_226x311_0.jpg"
			},
			"parent_category_id": "CAT638",
			"path": "CAT19981",
			"subCategories": []
			},
			"CAT641": {
			"category_id": "CAT641",
			"category_level": 4,
			"category_name": "Compact",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RACC02_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RACC02_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RACC02_226x311_0.jpg"
			},
			"parent_category_id": "CAT638",
			"path": "CAT641",
			"subCategories": []
			},
			"CAT643": {
			"category_id": "CAT643",
			"category_level": 4,
			"category_name": "Foundation",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1G5Y15_420x578_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_1G5Y15_420x578_1.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1G5Y15_308x424_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_1G5Y15_308x424_1.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_1G5Y15_226x311_0.jpg"
			},
			"parent_category_id": "CAT638",
			"path": "CAT643",
			"subCategories": []
			},
			"CAT1473": {
			"category_id": "CAT1473",
			"category_level": 4,
			"category_name": "Primer",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RMY201_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RMY201_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RMY201_226x311_0.jpg"
			},
			"parent_category_id": "CAT638",
			"path": "CAT1473",
			"subCategories": []
			},
			"CAT640": {
			"category_id": "CAT640",
			"category_level": 4,
			"category_name": "Bronzer",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RRK302_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RRK302_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RRK302_226x311_0.jpg"
			},
			"parent_category_id": "CAT638",
			"path": "CAT640",
			"subCategories": []
			},
			"CAT639": {
			"category_id": "CAT639",
			"category_level": 4,
			"category_name": "Blush",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R66C21_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R66C21_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R66C21_226x311_0.jpg"
			},
			"parent_category_id": "CAT638",
			"path": "CAT639",
			"subCategories": []
			},
			"CAT644": {
			"category_id": "CAT644",
			"category_level": 4,
			"category_name": "Powder",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P1JC01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P1JC01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P1JC01_226x311_0.jpg"
			},
			"parent_category_id": "CAT638",
			"path": "CAT644",
			"subCategories": []
			},
			"CAT642": {
			"category_id": "CAT642",
			"category_level": 4,
			"category_name": "Concealer",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_P1PA01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_P1PA01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_P1PA01_226x311_0.jpg"
			},
			"parent_category_id": "CAT638",
			"path": "CAT642",
			"subCategories": []
			},
			"CAT681": {
			"category_id": "CAT681",
			"category_level": 2,
			"category_name": "Skincare",
			"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
			},
			"parent_category_id": "CAT570",
			"path": "CAT681",
			"subCategories": [{
				"category_id": "CAT683",
				"category_level": 3,
				"category_name": "By Category",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R6C801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R6C801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R6C801_226x311_0.jpg"
				},
				"parent_category_id": "CAT681",
				"path": "CAT683"
			}, {
				"category_id": "CAT12966",
				"category_level": 3,
				//"category_name": "Category",
				"category_name": "By Concern",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_Y4PJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_Y4PJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_Y4PJ01_226x311_0.jpg"
				},
				"parent_category_id": "CAT681",
				"path": "CAT12966"
			}, {
				//"category_id": "CAT1285",
				"category_id": "CAT707",
				"category_level": 3,
				"category_name": "Collections",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RLJP01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RLJP01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RLJP01_226x311_0.jpg"
				},
				"parent_category_id": "CAT681",
				"path": "CAT1285"
			}]
			},
			"JCAT_MAKEUP_COLLECTIONS": {
			"category_id": "JCAT_MAKEUP_COLLECTIONS",
			"category_name": "Collections",
			"subCategories": [{
				"category_id": "JCAT_DOUBLE_WEAR",
				"category_name": "Double Wear",
			}, {
				"category_id": "JCAT_PURE_COLOR",
				"category_name": "Pure Color",
			}, {
				"category_id": "JCAT_PURE_COLOR_ENVY",
				"category_name": "Pure Color Envy",
			}, {
				"category_id": "JCAT_PURE_COLOR_LOVE",
				"category_name": "Pure Color Love",
			}, {
				"category_id": "JCAT_SUMPTUOUS",
				"category_name": "Sumptuous",
			}],
			},
			"JCAT_DOUBLE_WEAR": {
			"category_id": "JCAT_DOUBLE_WEAR",
			"category_name": "Double Wear",
			"product_id": ["PROD3894","PROD36639","PROD49039","PROD50562","PROD42415","PROD47763","PROD3542","PROD40882","PROD13015","PROD55810","PROD22832","PROD39750","PROD29664","PROD17442","PROD3513","PROD34101","PROD13704","PROD3300","PROD3324","PROD6509","PROD46415"],
			},
			"JCAT_PURE_COLOR": {
			"category_id": "JCAT_PURE_COLOR",
			"category_name": "Pure Color",
			"product_id": ["PROD13559","PROD38309","PROD13698","PROD27127","PROD13562"]
			},
			"JCAT_PURE_COLOR_ENVY": {
			"category_id": "JCAT_PURE_COLOR_ENVY",
			"category_name": "Pure Color Envy",
			"product_id": ["PROD49272","PROD53180","PROD49275","PROD29657","PROD36033","PROD42670","PROD38592","PROD35813","PROD38594","PROD35934","PROD31435","PROD35339","PROD51340","PROD51343"],
			},
			"JCAT_PURE_COLOR_LOVE": {
			"category_id": "JCAT_PURE_COLOR_LOVE",
			"category_name": "Pure Color Love",
			"product_id": ["PROD46704"]
			},
			"JCAT_SUMPTUOUS": {
			"category_id": "JCAT_SUMPTUOUS",
			"category_name": "Sumptuous",
			"product_id": ["PROD29626","PROD25335","PROD9518","PROD3599"]
			},
			"JCAT_ULTIMATE_DIAMOND": {
			"category_id": "JCAT_ULTIMATE_DIAMOND",
			"category_level": 2,
			"category_name": "Ultimate Diamond",
			"product_id": ["PROD47762","PROD35652","PROD35120","PROD30537","PROD37353"]
			},
			"JCAT_COLOUR_CORRECTOR": {
			"category_id": "JCAT_COLOUR_CORRECTOR",
			"category_level": 2,
			"category_name": "Colour Corrector",
			"product_id": ["PROD55810"]
			},
			"JCAT_NEW_IN": {
			"category_id": "NEW_IN",
			"category_level": 2,
			"category_name": "New in",
			"category_image": {
				"LARGE_IMAGE": [],
				"MEDIUM_IMAGE": [],
				"SMALL_IMAGE": []
			},
			"product_id": ["PROD56870","PROD57266","PROD53180","PROD55184","PROD55810","PROD39750","PROD55182","PROD53178","PROD56857","PROD13015","PROD51346","PROD56086","PROD55811","PROD56088","PROD51308","PROD51310","PROD51311","PROD56129","PROD56130"]
			},
			"JCAT_ADVANCED_NIGHT": {
			"category_id": "JCAT_ADVANCED_NIGHT",
			"category_level": 4,
			"category_name": "Advanced Night Repair",
			"category_description": "Renew. Re-ignite. Hydrate. ADVANCED NIGHT REPAIROUR NUMBER ONE SERUM. THE POWER SIGNAL THAT REINVENTS BEAUTY SLEEP.",
			"product_id": ["PROD26959","PROD39476","PROD46655","PROD36881","PROD43034","PROD39648","PROD31378","PROD35783","PROD31272","PROD39367"],
			},
			"JCAT_ADVANCED_TIME": {
			"category_id": "JCAT_ADVANCED_TIME",
			"category_level": 4,
			"category_name": "Advanced Time Zone",
			"category_description": "",
			"product_id": ["PROD27956","PROD24110","PROD24108","PROD24109","PROD24112"]
			},
			"JCAT_CLEAR_DIFFERENCE": {
			"category_id": "JCAT_CLEAR_DIFFERENCE",
			"category_level": 4,
			"category_name": "Clear Difference",
			"category_description": "",
			"product_id": ["PROD35293","PROD35453","PROD30475"]
			},
			"JCAT_CRESCENT_WHITE": {
			"category_id": "JCAT_CRESCENT_WHITE",
			"category_level": 4,
			"category_name": "Crescent White",
			"category_description": "",
			"product_id": ["PROD42994","PROD36841","PROD36842","PROD36843","PROD35023","PROD35024","PROD35025","PROD35026","PROD35022"]
			},
			"JCAT_DAYWEAR": {
			"category_id": "JCAT_DAYWEAR",
			"category_level": 4,
			"category_name": "DayWear",
			"category_description": "",
			"product_id": ["PROD46486","PROD13158","PROD20703","PROD20671","PROD25712","PROD13160"]
			},
			"JCAT_ENLIGHTEN": {
			"category_id": "JCAT_ENLIGHTEN",
			"category_level": 4,
			"category_name": "Enlighten",
			"category_description": "",
			"product_id": ["PROD32119","PROD32120","PROD32121"]
			},
			"JCAT_IDEALIST": {
			"category_id": "JCAT_IDEALIST",
			"category_level": 4,
			"category_name": "Idealist",
			"category_description": "",
			"product_id": ["PROD3298"]
			},
			"JCAT_NIGHTWEAR": {
			"category_id": "JCAT_NIGHTWEAR",
			"category_level": 4,
			"category_name": "NightWear",
			"category_description": "",
			"product_id": ["PROD37349","PROD37350"]
			},
			"JCAT_NUTRITIOUS": {
			"category_id": "JCAT_NUTRITIOUS",
			"category_level": 4,
			"category_name": "Nutritious",
			"category_description": "",
			"product_id": ["PROD46227","PROD46264","PROD46226","PROD46282","PROD39044","PROD35204","PROD35205","PROD45496","PROD42244"]
			},
			"JCAT_PERFECTIONIST": {
			"category_id": "JCAT_PERFECTIONIST",
			"category_level": 4,
			"category_name": "Perfectionist",
			"category_description": "Fight the Look of Gravity. ESTÉE LAUDER INVENTS NEW PERFECTIONIST PRO. RAPID FIRM + LIFT TREATMENT. WITH ACETYL HEXAPEPTIDE-8",
			"product_id": ["PROD55184","PROD53178","PROD21181","PROD31165","PROD31166"]
			},
			"JCAT_RESILIENT": {
			"category_id": "JCAT_RESILIENT",
			"category_level": 4,
			"category_name": "Resilient Lift",
			"category_description": "",
			"product_id": ["PROD46658","PROD36297","PROD17838","PROD17840","PROD17516"]
			},
			"JCAT_REVITALIZING": {
			"category_id": "JCAT_REVITALIZING",
			"category_level": 4,
			"category_name": "Revitalizing Supreme",
			"category_description": "Key to Glow. REVITALIZING SUPREME + CREME AND NEW EYE BALM FOR FIRMER, SMOOTHER, MORE RADIANT-LOOKING SKIN.",
			"product_id": ["PROD51346","PROD46656","PROD42475","PROD46657","PROD46779","PROD41234","PROD39885","PROD33018","PROD30033"]
			},
	
			"CAT1285": {
			"category_id": "CAT1285",
			"category_level": 3,
			//"category_name": "Tools & More",
			"category_name": "Collections",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RLJP01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RLJP01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RLJP01_226x311_0.jpg"
			},
			"parent_category_id": "CAT681",
			"path": "CAT1285",
			"subCategories": [{
				"category_id": "JCAT_ADVANCED_NIGHT",
				"category_name": "Advanced Night Repair",
			}, {
				"category_id": "JCAT_ADVANCED_TIME",
				"category_name": "Advanced Time Zone",
			}, {
				"category_id": "JCAT_CLEAR_DIFFERENCE",
				"category_name": "Clear Difference",
			}, {
				"category_id": "JCAT_CRESCENT_WHITE",
				"category_name": "Crescent White",
			}, {
				"category_id": "JCAT_DAYWEAR",
				"category_name": "DayWear",
			}, {
				"category_id": "JCAT_ENLIGHTEN",
				"category_name": "Enlighten",
			}, {
				"category_id": "JCAT_IDEALIST",
				"category_name": "Idealist",
			}, {
				"category_id": "JCAT_NIGHTWEAR",
				"category_name": "NightWear",
			}, {
				"category_id": "JCAT_NUTRITIOUS",
				"category_name": "Nutritious",
			}, {
				"category_id": "JCAT_PERFECTIONIST",
				"category_name": "Perfectionist",
			}, {
				"category_id": "JCAT_RESILIENT",
				"category_name": "Resilient Lift",
			}, {
				"category_id": "JCAT_REVITALIZING",
				"category_name": "Revitalizing Supreme",
			}]
			},
			"CAT707": {
			"category_id": "CAT707",
			"category_level": 4,
			"category_name": "Sets & Gifts",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RTY701_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RTY701_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RTY701_226x311_0.jpg"
			},
			"parent_category_id": "CAT1285",
			"path": "CAT707",
			"subCategories": []
			},
			"CAT12966": {
			"category_id": "CAT12966",
			"category_level": 3,
			//"category_name": "Category",
			"category_name": "By Concern",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_Y4PJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_Y4PJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_Y4PJ01_226x311_0.jpg"
			},
			"parent_category_id": "CAT681",
			"path": "CAT12966",
			"subCategories": [{
				"category_id": "JCAT_ACNE_BLEMISHES",
				"category_name": "Acne & Blemishes",
				"category_level": 4,
			}, {
				"category_id": "JCAT_ANTI_AGEING",
				"category_name": "Anti-Ageing",
				"category_level": 4,
			}, {
				"category_id": "JCAT_HYDRATION",
				"category_name": "Hydration",
				"category_level": 4,
			}, {
				"category_id": "JCAT_ENV_PROTECT",
				"category_name": "Environmental Protection",
				"category_level": 4,
			}, {
				"category_id": "JCAT_LACK_RADIANCE",
				"category_name": "Lack of Radiance",
				"category_level": 4,
			}, {
				"category_id": "JCAT_PIGMENT",
				"category_name": "Pigment & Age Spots",
				"category_level": 4,
			}, {
				"category_id": "JCAT_PORES",
				"category_name": "Pores",
				"category_level": 4,
			}, {
				"category_id": "CAT691",
				"category_level": 4,
				"category_name": "Sensitive Skin",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_094001_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_094001_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_094001_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT691"
			}]
			},
			"JCAT_ACNE_BLEMISHES": {
			"category_id": "JCAT_ACNE_BLEMISHES",
			"category_level": 4,
			"category_name": "Acne & Blemishes",
			"category_description": "TARGET, TREAT AND DRAMATICALLY REDUCE BLEMISHES FOR SKIN THAT LOOKS CLEAR, FRESH AND VIRTUALLY PORELESS. HELP PREVENT NEW ONES FROM FORMING.",
			"product_id": ["PROD35293","PROD35453","PROD30475","PROD20703"],
			},
			"JCAT_ANTI_AGEING": {
			"category_id": "JCAT_ANTI_AGEING",
			"category_level": 4,
			"category_name": "Anti-Ageing",
			"category_description": "REWIND TIME. HELP REVERSE VISIBLE SIGNS OF AGING AND DRAMATICALLY REDUCE THE LOOK OF LINES AND WRINKLES.",
			"product_id": ["PROD26959","PROD3298","PROD53178","PROD55184","PROD21181","PROD24108","PROD24109","PROD24110","PROD27956","PROD24112","PROD20671","PROD25712","PROD13158","PROD20703","PROD13160","PROD17838","PROD27955","PROD17840","PROD17516"]
			},
			"JCAT_HYDRATION": {
			"category_id": "JCAT_HYDRATION",
			"category_level": 4,
			"category_name": "Hydration",
			"category_description": "HELP PROTECT YOUR SKIN AND REDUCE THE FIRST SIGNS OF AGEING SO YOU LOOK YOUNGER LONGER. HELP PREVENT FUTURE LINES AND WRINKLES FROM FORMING.",
			"product_id": ["PROD26959","PROD3298","PROD20671","PROD25712","PROD13158","PROD20703","PROD13160"]
			},
			"JCAT_ENV_PROTECT": {
			"category_id": "JCAT_ENV_PROTECT",
			"category_level": 4,
			"category_name": "Environmental Protection",
			"category_description": "PROTECT YOUR SKIN AGAINST DAYTIME DAMAGE AND PREMATURE AGEING WITH THE MOST EFFECTIVE MULTI-DEFENSE, ANTI-OXIDANT POWER.",
			"parent_category_id": "CAT12966",
			"path": "CAT12967",
			"product_id": ["PROD26959","PROD39476","PROD39367","PROD13160","PROD13158","PROD25712","PROD39044","PROD35204","PROD42244","PROD46227","PROD35026","PROD25713"]
			},
			"JCAT_LACK_RADIANCE": {
				"category_id": "JCAT_LACK_RADIANCE",
			"category_level": 4,
			"category_name": "Lack of Radiance",
			"category_description": "",
			"parent_category_id": "CAT12966",
			"product_id": ["PROD46227","PROD46264","PROD46226","PROD46282","PROD39044","PROD35204","PROD35205","PROD45496","PROD42244"]
			},
			"JCAT_PIGMENT": {
			"category_id": "JCAT_PIGMENT",
			"category_level": 4,
			"category_name": "Pigment & Age Spots",
			"category_description": "HELP CORRECT ALL TYPES OF UNEVEN SKINTONE FOR A NATURALLY GLOWING, MORE EVEN TONED LOOK. HELP PROTECT SKIN AND PREVENT FUTURE DISCOLORATIONS.",
			"parent_category_id": "CAT12966",
			"product_id": ["PROD32119","PROD32120","PROD32121","PROD36841","PROD42994","PROD36842","PROD36843","PROD35023","PROD35024","PROD35025","PROD35026","PROD35022"]
			},
			"JCAT_PORES": {
			"category_id": "JCAT_PORES",
			"category_level": 4,
			"category_name": "Pores",
			"category_description": "MINIMISE PORES AND REDUCE SHINE. REVEAL YOUR CLEAREST, SMOOTHEST AND FRESHEST-LOOKING SKIN.",
			"parent_category_id": "CAT12966",
			"product_id" : ["PROD46264","PROD46227","PROD46226","PROD46282","PROD30475","PROD35453","PROD35293","PROD37350","PROD42244","PROD25713","PROD25959","PROD3298"]
			},
			"CAT12967": {
			"category_id": "CAT12967",
			"category_level": 4,
			"category_name": "Moisturizers",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_Y4PJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_Y4PJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_Y4PJ01_226x311_0.jpg"
			},
			"parent_category_id": "CAT12966",
			"path": "CAT12967",
			"subCategories": []
			},
			"CAT683": {
			"category_id": "CAT683",
			"category_level": 3,
			"category_name": "By Category",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_R6C801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_R6C801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_R6C801_226x311_0.jpg"
			},
			"parent_category_id": "CAT681",
			"path": "CAT683",
			"subCategories": [{
				"category_id": "CAT689",
				"category_level": 4,
				"category_name": "Repair Serums",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YF4901_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YF4901_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YF4901_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT689"
			}, {
				"category_id": "CAT685",
				"category_level": 4,
				"category_name": "Eye Care",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RT9F01_420x578_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RT9F01_420x578_1.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RT9F01_420x578_2.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RT9F01_308x424_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RT9F01_308x424_1.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RT9F01_308x424_2.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RT9F01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT685"
			}, {
				"category_id": "CAT688",
				"category_level": 4,
				//"category_name": "Moisturisers",
				"category_name": "Moisturiser",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RJ1801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RJ1801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RJ1801_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT688"
			}, {
				"category_id": "CAT12367",
				"category_level": 4,
				"category_name": "BB & CC Creme",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_Y4PJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_Y4PJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_Y4PJ01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT12367"
			}, {
				"category_id": "CAT684",
				"category_level": 4,
				//"category_name": "Cleansers / Toners",
				"category_name": "Cleansers / Toner",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_REJF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_REJF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_REJF01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT684"
			}, {
				"category_id": "CAT687",
				"category_level": 4,
				"category_name": "Masks / Exfoliators",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_REGY01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_REGY01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_REGY01_226x311_0.jpg"
				},
				"parent_category_id": "CAT683",
				"path": "CAT687"
			}]
			},
			"CAT686": {
			"category_id": "CAT686",
			"category_level": 4,
			"category_name": "Makeup Removers",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YCF701_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YCF701_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YCF701_226x311_0.jpg"
			},
			"parent_category_id": "CAT683",
			"path": "CAT686",
			"subCategories": []
			},
			"CAT12367": {
			"category_id": "CAT12367",
			"category_level": 4,
			"category_name": "BB & CC Creme",
			"category_description": "MOISTURISE, PROTECT AND PERFECT WITH POWERFUL ANTI-OXIDANTS AND SPF 35. 2 SHEER SHADES",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_Y4PJ01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_Y4PJ01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_Y4PJ01_226x311_0.jpg"
			},
			"parent_category_id": "CAT683",
			"path": "CAT12367",
			"subCategories": []
			},
			"CAT693": {
			"category_id": "CAT693",
			"category_level": 4,
			"category_name": "Specialists",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YGPX01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YGPX01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YGPX01_226x311_0.jpg"
			},
			"parent_category_id": "CAT683",
			"path": "CAT693",
			"subCategories": []
			},
			"CAT687": {
			"category_id": "CAT687",
			"category_level": 4,
			"category_name": "Masks / Exfoliators",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_REGY01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_REGY01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_REGY01_226x311_0.jpg"
			},
			"parent_category_id": "CAT683",
			"path": "CAT687",
			"subCategories": []
			},
			"CAT688": {
			"category_id": "CAT688",
			"category_level": 4,
			"category_name": "Moisturisers",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RJ1801_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RJ1801_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RJ1801_226x311_0.jpg"
			},
			"parent_category_id": "CAT683",
			"path": "CAT688",
			"subCategories": []
			},
			"CAT1216": {
			"category_id": "CAT1216",
			"category_level": 4,
			"category_name": "Sun / Sunless",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YCL301_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YCL301_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YCL301_226x311_0.jpg"
			},
			"parent_category_id": "CAT683",
			"path": "CAT1216",
			"subCategories": []
			},
			"CAT691": {
			"category_id": "CAT691",
			"category_level": 4,
			"category_name": "Sensitive Skin",
			"category_description": "SOOTHE, CALM AND RESTORE SKIN. REBUILD SKIN’S OWN NATURAL PROTECTIVE BARRIER SO IT DOESN’T BEHAVE LIKE SENSITIVE SKIN.",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_094001_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_094001_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_094001_226x311_0.jpg"
			},
			"parent_category_id": "CAT683",
			"path": "CAT691",
			"subCategories": []
			},
			"CAT685": {
			"category_id": "CAT685",
			"category_level": 4,
			"category_name": "Eye Care",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RT9F01_420x578_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RT9F01_420x578_1.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_RT9F01_420x578_2.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RT9F01_308x424_0.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RT9F01_308x424_1.jpg", "https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_RT9F01_308x424_2.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_RT9F01_226x311_0.jpg"
			},
			"parent_category_id": "CAT683",
			"path": "CAT685",
			"subCategories": []
			},
			"CAT689": {
			"category_id": "CAT689",
			"category_level": 4,
			"category_name": "Repair Serums",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_YF4901_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_YF4901_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_YF4901_226x311_0.jpg"
			},
			"parent_category_id": "CAT683",
			"path": "CAT689",
			"subCategories": [{
				"category_id": "CAT3751",
				"category_level": 5,
				"category_name": "Deluxe Large Sizes",
				"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9MTG01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9MTG01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9MTG01_226x311_0.jpg"
				},
				"parent_category_id": "CAT689",
				"path": "CAT3751"
			}]
			},
			"CAT3751": {
			"category_id": "CAT3751",
			"category_level": 5,
			"category_name": "Deluxe Large Sizes",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_9MTG01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_9MTG01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_9MTG01_226x311_0.jpg"
			},
			"parent_category_id": "CAT689",
			"path": "CAT3751",
			"subCategories": []
			},
			"CAT684": {
			"category_id": "CAT684",
			"category_level": 4,
			"category_name": "Cleansers / Toners",
			"category_image": {
				"LARGE_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/420x578/el_sku_REJF01_420x578_0.jpg"],
				"MEDIUM_IMAGE": ["https://www.esteelauder.co.uk/media/export/cms/products/308x424/el_sku_REJF01_308x424_0.jpg"],
				"SMALL_IMAGE": "https://www.esteelauder.co.uk/media/export/cms/products/226x311/el_sku_REJF01_226x311_0.jpg"
			},
			"parent_category_id": "CAT683",
			"path": "CAT684",
			"subCategories": []
			}
		}
	}
}



crawlProductData(function(err){
	if (err){
		console.log("Crashed: " , err)
	}
	else {
		console.log("Done!")
	}
})

// fetchCategoryProductMetadata("CAT570", function(err, data){
// 	console.log(JSON.stringify(data, null, 4))
// })