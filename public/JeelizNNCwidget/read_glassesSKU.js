$(document).ready(function() {
    $.ajax({
        type: "GET",
        url: "/JeelizNNCwidget/glassesSKU.csv",
        contentType: "text/csv",
        crossDomain: true,
        success: function(data) {
            processData(data);
        }
     });
});
var lines =[];
function processData(allText) {
    var allTextLines = allText.split(/\r\n|\n/);
    var headers = allTextLines[0].split(',');

    for (var i=1; i<allTextLines.length; i++) {
        var data = allTextLines[i].split(',')[0];
        lines.push(data);
    }
}

function getRandom(){
    return lines[Math.floor(Math.random() * lines.length)];
}