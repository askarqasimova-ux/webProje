const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();

app.use(express.static(__dirname));


app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html"); 
});

app.use(cors());
app.use(express.json()); 


let hizmetHesabi;

if (process.env.FIREBASE_PRIVATE_KEY_JSON) {
 
  hizmetHesabi = JSON.parse(process.env.FIREBASE_PRIVATE_KEY_JSON);
} else {
  
  hizmetHesabi = require("./serviceAccountKey.json");
}

admin.initializeApp({
  credential: admin.credential.cert(hizmetHesabi),
  databaseURL: "https://eticaret-60436-default-rtdb.europe-west1.firebasedatabase.app" 
});

const db = admin.database();

app.get("/api/dbUrunler", async (req, res) => {
  try {
    const ref = db.ref("urunler");
    const snapshot = await ref.once("value");
    const veriler = snapshot.val();

    const urunListesi = [];
    if (veriler) {
      Object.keys(veriler).forEach((key) => {
        urunListesi.push({ id: key, ...veriler[key] });
      });
    }
    res.json(urunListesi);
  } catch (hata) {
    console.error("Firebase Hatası:", hata);
    res.status(500).send("Sunucu hatası");
  }
});

app.post("/api/kayit", async (req, res) => {
  try {
    let { ad, sifre } = req.body;
   
    const temizAd = ad.replace(/[.#$[\]]/g, "_"); 

    const kullaniciRef = db.ref(`kullanicilar/${temizAd}`);
    const snapshot = await kullaniciRef.once("value");

    if (snapshot.exists()) {
      return res.status(400).json({ mesaj: "Bu kullanıcı zaten var!" });
    }

    await kullaniciRef.set({
      ad: ad,
      sifre: sifre 
    });

    res.json({ mesaj: "Kayıt başarılı!" });
  } catch (hata) {
    console.error("Kayıt Hatası:", hata);
    res.status(500).send("Sunucu hatası");
  }
});

app.post("/api/giris", async (req, res) => {
  try {
    let { ad, sifre } = req.body;
    const temizAd = ad.replace(/[.#$[\]]/g, "_");

    const kullaniciRef = db.ref(`kullanicilar/${temizAd}`);
    const snapshot = await kullaniciRef.once("value");

    if (snapshot.exists() && snapshot.val().sifre === sifre) {
      res.json({ basarili: true });
    } else {
      res.json({ basarili: false });
    }
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

app.put("/api/guncelle", async (req, res) => {
  try {
    let { eskiAd, yeniAd, yeniSifre } = req.body;
    const temizEskiAd = eskiAd.replace(/[.#$[\]]/g, "_");
    const temizYeniAd = yeniAd.replace(/[.#$[\]]/g, "_");

    const eskiKullaniciRef = db.ref(`kullanicilar/${temizEskiAd}`);
    const yeniKullaniciRef = db.ref(`kullanicilar/${temizYeniAd}`);
    
    await yeniKullaniciRef.set({ ad: yeniAd, sifre: yeniSifre });
    if (temizEskiAd !== temizYeniAd) {
      await eskiKullaniciRef.remove(); 
    }

    const eskiSepetRef = db.ref(`sepet/${temizEskiAd}`);
    const yeniSepetRef = db.ref(`sepet/${temizYeniAd}`);
    const sepetSnapshot = await eskiSepetRef.once("value");

    if (sepetSnapshot.exists()) {
      await yeniSepetRef.set(sepetSnapshot.val());
      await eskiSepetRef.remove();
    }

    res.json({ mesaj: "Güncellendi" });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

app.put("/api/sifreGuncelle", async (req, res) => {
  try {
    let { yeniAd, yeniSifre } = req.body;
    const temizAd = yeniAd.replace(/[.#$[\]]/g, "_");

    await db.ref(`kullanicilar/${temizAd}`).update({ sifre: yeniSifre });
    res.json({ mesaj: "Güncellendi" });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

app.get("/api/sepet/:kullanici", async (req, res) => {
  try {
    const temizAd = req.params.kullanici.replace(/[.#$[\]]/g, "_");
    const sepetSnapshot = await db.ref(`sepet/${temizAd}`).once("value");
    const sepetVerisi = sepetSnapshot.val();

    if (!sepetVerisi) {
      return res.json([]);
    }

    const urunlerSnapshot = await db.ref("urunler").once("value");
    const tumUrunler = urunlerSnapshot.val() || {};

    const sepetListesi = [];
    Object.keys(sepetVerisi).forEach((key) => {
      const sepetItem = sepetVerisi[key];
      const urunDetay = tumUrunler[sepetItem.urunId];

      if (urunDetay) {
        sepetListesi.push({
          sepetItemId: key, 
          id: sepetItem.urunId,
          ad: urunDetay.ad,
          fiyat: urunDetay.fiyat,
          image: urunDetay.image,
          indirimfiyat: urunDetay.indirimfiyat,
          kupon: sepetItem.kupon || null
        });
      }
    });

    res.json(sepetListesi);
  } catch (hata) {
    console.error(hata);
    res.status(500).send("Sunucu hatası");
  }
});


app.post("/api/sepet/ekle", async (req, res) => {
  try {
    let { kullanici, urunId } = req.body;
    const temizAd = kullanici.replace(/[.#$[\]]/g, "_");

    await db.ref(`sepet/${temizAd}`).push({
      urunId: urunId,
      eklenmeTarihi: Date.now()
    });

    res.json({ mesaj: "Eklendi" });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});


app.delete("/api/sepet/sil/:kullanici/:urunId", async (req, res) => {
  try {
    const temizAd = req.params.kullanici.replace(/[.#$[\]]/g, "_");
    const gelenId = req.params.urunId;

    const sepetRef = db.ref(`sepet/${temizAd}`);
    
    
    let snapshot = await sepetRef.orderByChild("urunId").equalTo(parseInt(gelenId)).once("value");
    
    if (!snapshot.exists()) {
      snapshot = await sepetRef.orderByChild("urunId").equalTo(gelenId.toString()).once("value");
    }
    
    if (snapshot.exists()) {
   
      const ilkUrunKey = Object.keys(snapshot.val())[0];
      await db.ref(`sepet/${temizAd}/${ilkUrunKey}`).remove();
      res.json({ mesaj: "Silindi" });
    } else {
      res.status(404).json({ mesaj: "Ürün sepetinizde bulunamadı" });
    }
  } catch (hata) {
    console.error("Silme Hatası:", hata);
    res.status(500).send("Sunucu hatası");
  }
});


app.delete("/api/sepet/temizle/:kullanici", async (req, res) => {
  try {
    const temizAd = req.params.kullanici.replace(/[.#$[\]]/g, "_");
    await db.ref(`sepet/${temizAd}`).remove();
    res.json({ mesaj: "Sepet temizlendi" });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});


app.get("/api/populer-urun", async (req, res) => {
  try {
    const sepetSnapshot = await db.ref("sepet").once("value");
    const sepetler = sepetSnapshot.val() || {};

    const sayac = {};
    Object.keys(sepetler).forEach((kullaniciKey) => {
      const kullaniciSepeti = sepetler[kullaniciKey];
      Object.keys(kullaniciSepeti).forEach((itemKey) => {
        const urunId = kullaniciSepeti[itemKey].urunId;
        sayac[urunId] = (sayac[urunId] || 0) + 1;
      });
    });

    const siraliUrunler = Object.keys(sayac)
      .map(id => ({ id, eklenmeSayisi: sayac[id] }))
      .sort((a, b) => b.eklenmeSayisi - a.eklenmeSayisi)
      .slice(0, 2); // TOP 2

    if (siraliUrunler.length === 0) {
      return res.json(null);
    }

    const urunlerSnapshot = await db.ref("urunler").once("value");
    const tumUrunler = urunlerSnapshot.val() || {};

    const sonuc = siraliUrunler.map(item => ({
      id: item.id,
      eklenmeSayisi: item.eklenmeSayisi,
      ...(tumUrunler[item.id] || {})
    }));

    res.json(sonuc);
  } catch (hata) {
    console.error("SQL/Firebase Hatası:", hata);
    res.status(500).send("Sunucu hatası");
  }
});


app.listen(3002, () => {
  console.log("Firebase destekli sunucu 3002 portunda çalışıyor...");
});
