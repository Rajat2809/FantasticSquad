module.exports = function(sequelize, DataTypes) {
    return sequelize.define('sku', {
    	id: {
    	    type: DataTypes.INTEGER,
    	    allowNull: false,
    	    autoIncrement: true,
          primaryKey: true
    	},
      merchantId: {
        type: DataTypes.STRING,
      },
      smooshImage: {
        type: DataTypes.STRING
      },
      colorHex: {
        type: DataTypes.STRING
      },
      image: {
        type: DataTypes.TEXT
      },
      price: {
        type: DataTypes.FLOAT
      },
      currency: {
        type: DataTypes.STRING
      },
      shadeName: {
        type: DataTypes.STRING
      },
      size: {
        type: DataTypes.STRING
      },
      isPublished: {
        type: DataTypes.BOOLEAN
      },
      inventory: {
        type: DataTypes.INTEGER
      }
    });
};
