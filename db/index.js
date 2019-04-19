const Sequelize = require('sequelize');

const database = "cmpe295";
const username = "root";
const password = "cmpe295project";
const host = "cmpe295.cc4rjbjpmtni.us-east-2.rds.amazonaws.com";
const port = "5432"

const Op = Sequelize.Op;
const operatorsAliases = {
    $eq: Op.eq,
    $ne: Op.ne,
    $gte: Op.gte,
    $gt: Op.gt,
    $lte: Op.lte,
    $lt: Op.lt,
    $not: Op.not,
    $in: Op.in,
    $notIn: Op.notIn,
    $is: Op.is,
    $like: Op.like,
    $notLike: Op.notLike,
    $iLike: Op.iLike,
    $notILike: Op.notILike,
    $regexp: Op.regexp,
    $notRegexp: Op.notRegexp,
    $iRegexp: Op.iRegexp,
    $notIRegexp: Op.notIRegexp,
    $between: Op.between,
    $notBetween: Op.notBetween,
    $overlap: Op.overlap,
    $contains: Op.contains,
    $contained: Op.contained,
    $adjacent: Op.adjacent,
    $strictLeft: Op.strictLeft,
    $strictRight: Op.strictRight,
    $noExtendRight: Op.noExtendRight,
    $noExtendLeft: Op.noExtendLeft,
    $and: Op.and,
    $or: Op.or,
    $any: Op.any,
    $all: Op.all,
    $values: Op.values,
    $col: Op.col
};

const config = {
  host: host,
  port: port,
  dialect: 'postgres',
  logging: false,
  operatorsAliases: operatorsAliases,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
}

const sequelize = new Sequelize(database, username, password, config);

var db = {
  sequelize: sequelize,
  User: sequelize.import(__dirname + '/model/user'),
  Product: sequelize.import(__dirname + '/model/product'),
  Sku: sequelize.import(__dirname + '/model/sku'),
  ShoppingCart: sequelize.import(__dirname + '/model/shoppingCart')
}

db.Product.hasMany(db.Sku);
db.Sku.belongsTo(db.Product);

module.exports = db

sequelize.sync()


//   .then(() => User.create({
//     username: 'janedoe',
//     birthday: new Date(1980, 6, 20)
//   }))
//   .then(jane => {
//     console.log(jane.toJSON());
//   });
