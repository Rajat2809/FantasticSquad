module.exports = function (sequelize, DataTypes) {
    return sequelize.define('shoppingCart', {
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true
        },
        items: {
            type: DataTypes.JSONB,
            allowNull: false
        },
        currencyCode: {
            type: DataTypes.TEXT,
            defaultValue: "USD"
        },
        price: {
            type: DataTypes.JSONB, 
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        isFulfilled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        isPaid: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        sessionToken: {
            type: DataTypes.TEXT
        },
        userId: {
            type: DataTypes.INTEGER
        },
        shippingAddress: {
            type: DataTypes.TEXT
        },
        paymentData: {
            type: DataTypes.JSONB
        },
        deviceInfo: {
            type: DataTypes.STRING
        },
        locale: {
            type: DataTypes.STRING
        }
    })
}
