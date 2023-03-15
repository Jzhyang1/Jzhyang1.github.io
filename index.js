
document.addEventListener("DOMContentLoaded", ()=>{
    var birthday = new Date(2006, 1 -1 /*-1 to convert to 0-indexing*/, 27);
    var ageDifMs = Date.now() - birthday;
    var days = ageDifMs / (1000 * 60 * 60 * 24);
    var yfrac = (days + 1) / 365.2425;
    var years = Math.floor(yfrac);
    document.getElementById('age').innerHTML = years;
})
