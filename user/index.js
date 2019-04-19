const _ = require("lodash");

module.exports.postRegister = function(req, res) {
    let {ownerName, userName, password} = {...req.body};
    console.log("ownerName" + ownerName);
    console.log("userName" + userName);
    console.log("password" + password);
    // console.log("hello");
    // console.log(ownerName);
    // console.log(userName);
    // console.log(password);
    // if (!ownerName || ownerName.length === 0) {
    //     res.json({error: "dealer name cannot be empty"});
    //     return;
    // }
    // if (!userName || userName.length === 0) {
    //     res.json({error: "dealer account user name cannot be empty"});
    //     return;
    // }
    // if (!password || password.length === 0) {
    //     res.json({error: "dealer password cannot be empty"});
    // }
    // req.flash('success', 'You are now registered and can log in')
    res.status(200);
    res.redirect('/admin/login');
}

module.exports.postLogin = function(req, res) {
  
}
