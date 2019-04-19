module.exports = function(sequelize, DataTypes) {
  return sequelize.define('product', {
    id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
    },
    merchantId: {
      type: DataTypes.STRING,
    },
    name: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    descriptions: {
        type: DataTypes.JSONB,
        alowNull: false
    },
    averageRating: {
      type: DataTypes.FLOAT,
    },
    isPublished: {
        type: DataTypes.BOOLEAN,
    },
    images: {
      type: DataTypes.JSONB
    },
    currency: {
      type: DataTypes.TEXT
    },
    priceRange: {
      type: DataTypes.JSONB
    },
    locale: {
      type: DataTypes.STRING
    },
    keywords: {
      type: DataTypes.TEXT
    },
    relatedProducts: {
      type: DataTypes.JSONB
    }
  });
};
