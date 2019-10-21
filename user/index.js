const _ = require("lodash");
const db = require("../db");
const reqst = require("request");


module.exports.getUser = function(req,res){
     let {email, pass} = {...req.query};
     console.log(email);
     db.User.findOne({where:{username:email}}).then(user=>{
         if(user){
         var u = JSON.parse(JSON.stringify(user));
         if(u.password == pass)
         res.send([true,u]);
         else
         res.send([false,null]);
        }
        else
        res.send([false,null]);
     });
}
module.exports.registerUser = function(req,res){
    let{email, pass, confirmPass} ={...req.query};
  if(pass && confirmPass && pass===confirmPass){
      let query = {
    username: email,
    password: pass,
    createdAt: Date.now(),
    updatedAt: Date.now()};
    console.log("Password Match");
    console.log(email);
    console.log(pass);
    db.User.create(query).done((err,res)=>{
        console.log(res);
        console.log(err);
    if(err){
        console.log(err.stack);
    }else{
        console.log(res);
    }
    });
  }
}
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
