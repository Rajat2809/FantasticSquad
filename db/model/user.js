module.exports = function(sequelize, DataTypes) {
    return sequelize.define('user', {
    	id: {
    	    type: DataTypes.INTEGER,
    	    allowNull: false,
    	    autoIncrement: true,
          primaryKey: true
    	},
    	username: {
    	    type: DataTypes.STRING(255),
          unique: true,
    	    allowNull: false,
    	},
    	password: {
    	    type: DataTypes.STRING(255),
    	    alowNull: false
    	},
    });
};
