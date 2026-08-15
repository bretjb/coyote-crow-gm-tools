var txtToArray = "Gatsi,pahinaga,Chikan,Na,Chimiin,chahota,zaadi,masikika mahipiya,Kangami,Tapachii,gopikagi,Gishkat,Wikwit,Wanga,wasti,wiigaas,panit,tachaka,tiko,panushins,zahoon,wakapan,koonoo,Thi,manikasokopa,Niyaashi,Kati,hanti,Chukan,Azayang,wapigam,kati,Sayata,Matoosiwan,Chithunwi,biza,maya,Mapaya,Chiwanga,Tawigam,haka,Mawanchi,Choona Wanaka,kisi,kaatii,naasii,piha,Patak,naadag,Gipan,Awis,ta,Minins,Shawaka,Niyan Thika,taazii,Nizi,Choota,poza,makapoo,wanapii,maka,Wihi,nishaawi,kawanzi,pichan,Chiwukichun,Narootaka,Doon,Thihan,Wuzuthi,kokiya,noosoo,woozoo wasti,Hoowuso,pihata,hugan,hoki,zaptaan,Paska,poho,gani,Zawam,Choona,Chankas,hawa,soongiiya,kola,zooya,Adanadi,taan,thatukaya,Mazakazi,wasti,toka,Chithanka,Daadoo,Dinisii,Thanka,Yakapaha,banosha,hota,Choona Sooki,Wagikoo,Mohina,kisi,hu,Tapingami,chitan,natsu,mooway,Wankata,Chichankoo,Paha,Wakaan,wayakati,kona,Nitat,paatinizi,waka,pawitoo,pawinooki,mikwam,Pathaka,Dasu,Minin,Niyan Thika,Choona Paya,Mashkigami,Gami,Thanka,koona,Wokahiya,zaagiti,Hakooh,yohookiya,yutsu,Thipi,Wipohi,pitaga,Hoopayi,Hasaka,Nakpan,Moonagan,Mizizibi,Anicha,hanawi,pina,hika,gaamothanka,kookoo,Wika,Yati,Kiyi,Thika,hisika,hii,Witan,Wazi,Makasing,tahoo,soonoot,ziti,Chigami,hoyo,Kan,nizi,Thipi,yaku,Wasazoo,Gatchoo,Sikagamii,yuni,Wosakati,pohii,hikanoo,migas,Zinyan,poka,wazi,sasan,Payi,wita,Paska,wastika,Daga,Kapist,Gamins,Mishgami,Nigam,Tawigins,makocha,shanisii,kakikuni,kah,sookiya,Tisoo,Niya,hoot,hanagazoo,huhi,Pawaatig,Woyi,tinoo,minaati,Minatin,Nizi,Chankoo,Niyan,zinzintka,moomoo,nigasimuni,misoo,Sagi,Sapana,atsi,Gichigamins,Wahkii,pitsika,Wakanang,Mazakaska,nami,sakpi,hani,Sika,sota,wa,wiipaahii,pohii wa,Tatat,Toka,Abayang,Sikahan,Zigwan,Nazinang,wichapi,Niyan,Wipi,Wayak,Nizins,wi,wakazii,mashkig,thipi,loova,Kiza,pina,migwich,Tahood,konisiing,tasama yookiit,chani,Thipasooka,thoonwi,Wayi,Chan,tipiwi,siyoo,tisi,makasi,kinapa,pimi,pit,Wanka,soomaka,wapatoosi,Thoonwiin,Thipa,wichasa,Gakawan,Tikiya,Wopi,paya,Watakiiwa,yoo,Thanka,manitoo,choowanzika,pasahiikoo,pohii daada,Thati,nipawaka,Chana,yaku,haa";

var languageGlossary = txtToArray.split(',');
var order = 2;
var ngrams = {};
var beginnings = [];

for (var j = 0; j < languageGlossary.length; j++) {
    var txt = languageGlossary[j];
    for (var i = 0; i <= txt.length - order; i++) {
        var gram = txt.substring(i, i + order);
        if (i == 0) {
            beginnings.push(gram);
        }
        if (!ngrams[gram]) {
            ngrams[gram] = [];
        }
        ngrams[gram].push(txt.charAt( i + order));
    }
}

function capitalize_Words(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
    }

function kagChahiNames () {
    var randomBeginning = Math.floor(Math.random() * beginnings.length);
    var currentGram = beginnings[randomBeginning];
    var newName = currentGram;
    function randomInRange (min,max) {
        return Math.floor((Math.random() * (max-min)) +min);
    }
    var randomNumberInRange = randomInRange(4,12);
    for (var i = 0; i < randomNumberInRange; i++) { 
        var possibilities = ngrams[currentGram];
        var randPossibility = Math.floor(Math.random() * possibilities.length);
        var next = possibilities[randPossibility];
        newName += next;
        var len = newName.length;
        currentGram = newName.substring(len - order, len);
    }
    return capitalize_Words(newName);
}