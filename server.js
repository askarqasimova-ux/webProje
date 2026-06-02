const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();

app.use(cors());
app.use(express.json()); // JSON verilerini okuyabilmek için şart

// -------------------------------------------------------------
// FIREBASE BAĞLANTI AYARLARI
// -------------------------------------------------------------
// TODO: Firebase Console -> Proje Ayarları -> Hizmet Hesapları (Service Accounts)
// bölümünden "Yeni Özel Anahtar Oluştur" diyerek indirdiğin JSON dosyasını prorene ekle.
let hizmetHesabi;

if (process.env.FIREBASE_PRIVATE_KEY_JSON) {
  // Render üzerinde çalışırken değişken içindeki JSON string'ini objeye çeviriyoruz
  hizmetHesabi = JSON.parse(process.env.FIREBASE_PRIVATE_KEY_JSON);
} else {
  // Lokal bilgisayarınızda test ederken yine eski usul dosyadan okuyabilir
  hizmetHesabi = require("./serviceAccountKey.json");
}

admin.initializeApp({
  credential: admin.credential.cert(hizmetHesabi),
  databaseURL: "https://eticaret-60436-default-rtdb.europe-west1.firebasedatabase.app" // TODO: Kendi Firebase Realtime DB URL'nizi yapıştırın
});

const db = admin.database();

// -------------------------------------------------------------
// 1. ÜRÜNLERİ GETİR
// -------------------------------------------------------------
app.get("/api/dbUrunler", async (req, res) => {
  try {
    const ref = db.ref("urunler");
    const snapshot = await ref.once("value");
    const veriler = snapshot.val();

    // Firebase objeleri key-value döner, bunu frontend'in beklediği dizi (array) formatına çeviriyoruz
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

// -------------------------------------------------------------
// 2. KULLANICI KAYIT OL
// -------------------------------------------------------------
app.post("/api/kayit", async (req, res) => {
  try {
    let { ad, sifre } = req.body;
    // Kullanıcı adını Firebase path'ine uygun hale getirmek için temizleyebilirsiniz (nokta, dolar işareti vs. barındırmamalı)
    const temizAd = ad.replace(/[.#$[\]]/g, "_"); 

    const kullaniciRef = db.ref(`kullanicilar/${temizAd}`);
    const snapshot = await kullaniciRef.once("value");

    if (snapshot.exists()) {
      return res.status(400).json({ mesaj: "Bu kullanıcı zaten var!" });
    }

    await kullaniciRef.set({
      ad: ad,
      sifre: sifre // Not: Gerçek projelerde şifreleri bcrypt ile şifrelemeniz önerilir
    });

    res.json({ mesaj: "Kayıt başarılı!" });
  } catch (hata) {
    console.error("Kayıt Hatası:", hata);
    res.status(500).send("Sunucu hatası");
  }
});

// -------------------------------------------------------------
// 3. KULLANICI GİRİŞ YAP
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// 4. BİLGİLERİ GÜNCELLE (Ad ve Şifre)
// -------------------------------------------------------------
app.put("/api/guncelle", async (req, res) => {
  try {
    let { eskiAd, yeniAd, yeniSifre } = req.body;
    const temizEskiAd = eskiAd.replace(/[.#$[\]]/g, "_");
    const temizYeniAd = yeniAd.replace(/[.#$[\]]/g, "_");

    const eskiKullaniciRef = db.ref(`kullanicilar/${temizEskiAd}`);
    const yeniKullaniciRef = db.ref(`kullanicilar/${temizYeniAd}`);
    
    // 1. Kullanıcı kaydını taşı/güncelle
    await yeniKullaniciRef.set({ ad: yeniAd, sifre: yeniSifre });
    if (temizEskiAd !== temizYeniAd) {
      await eskiKullaniciRef.remove(); // Eski kaydı sil
    }

    // 2. Sepet verilerini yeni kullanıcı adına aktar
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

// Sadece Şifre Güncelle
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

// -------------------------------------------------------------
// 5. KULLANICININ SEPETİNİ GETİR
// -------------------------------------------------------------
app.get("/api/sepet/:kullanici", async (req, res) => {
  try {
    const temizAd = req.params.kullanici.replace(/[.#$[\]]/g, "_");
    const sepetSnapshot = await db.ref(`sepet/${temizAd}`).once("value");
    const sepetVerisi = sepetSnapshot.val();

    if (!sepetVerisi) {
      return res.json([]);
    }

    // SQL'deki JOIN mantığını simüle etmek için ürün detaylarını da çekiyoruz
    const urunlerSnapshot = await db.ref("urunler").once("value");
    const tumUrunler = urunlerSnapshot.val() || {};

    const sepetListesi = [];
    Object.keys(sepetVerisi).forEach((key) => {
      const sepetItem = sepetVerisi[key];
      const urunDetay = tumUrunler[sepetItem.urunId];

      if (urunDetay) {
        sepetListesi.push({
          sepetItemId: key, // Firebase'in otomatik verdiği benzersiz push key'i
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

// -------------------------------------------------------------
// 6. SEPETE ÜRÜN EKLE
// -------------------------------------------------------------
app.post("/api/sepet/ekle", async (req, res) => {
  try {
    let { kullanici, urunId } = req.body;
    const temizAd = kullanici.replace(/[.#$[\]]/g, "_");

    // Her eklemede benzersiz bir key oluşturması için push() kullanıyoruz (Aynı üründen birden fazla eklenebilsin diye)
    await db.ref(`sepet/${temizAd}`).push({
      urunId: urunId,
      eklenmeTarihi: Date.now()
    });

    res.json({ mesaj: "Eklendi" });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

// -------------------------------------------------------------
// 7. SEPETTEN SADECE 1 ADET ÜRÜN SİL (TOP 1 mantığı)
// -------------------------------------------------------------
app.delete("/api/sepet/sil/:kullanici/:urunId", async (req, res) => {
  try {
    const temizAd = req.params.kullanici.replace(/[.#$[\]]/g, "_");
    const urunId = req.params.urunId;

    const sepetRef = db.ref(`sepet/${temizAd}`);
    // Eşleşen ürünü bulmak için sorguluyoruz
    const snapshot = await sepetRef.orderByChild("urunId").equalTo(parseInt(urunId) || urunId).once("value");
    
    if (snapshot.exists()) {
      // Sadece ilk eşleşen kaydın key'ini alıp siliyoruz (TOP 1 mantığı)
      const ilkUrunKey = Object.keys(snapshot.val())[0];
      await db.ref(`sepet/${temizAd}/${ilkUrunKey}`).remove();
      res.json({ mesaj: "Silindi" });
    } else {
      res.status(404).json({ mesaj: "Ürün sepetinizde bulunamadı" });
    }
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

// -------------------------------------------------------------
// 8. ONAYLA (SEPETİ TEMİZLE)
// -------------------------------------------------------------
app.delete("/api/sepet/temizle/:kullanici", async (req, res) => {
  try {
    const temizAd = req.params.kullanici.replace(/[.#$[\]]/g, "_");
    await db.ref(`sepet/${temizAd}`).remove();
    res.json({ mesaj: "Sepet temizlendi" });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

// -------------------------------------------------------------
// 9. POPÜLER ÜRÜNLER (En Çok Sepete Eklenen İlk 2 Ürün)
// -------------------------------------------------------------
app.get("/api/populer-urun", async (req, res) => {
  try {
    const sepetSnapshot = await db.ref("sepet").once("value");
    const sepetler = sepetSnapshot.val() || {};

    // NoSQL'de sayım işlemini manuel gruplayarak yapıyoruz
    const sayac = {};
    Object.keys(sepetler).forEach((kullaniciKey) => {
      const kullaniciSepeti = sepetler[kullaniciKey];
      Object.keys(kullaniciSepeti).forEach((itemKey) => {
        const urunId = kullaniciSepeti[itemKey].urunId;
        sayac[urunId] = (sayac[urunId] || 0) + 1;
      });
    });

    // En çok eklenene göre sıralama yapıyoruz
    const siraliUrunler = Object.keys(sayac)
      .map(id => ({ id, eklenmeSayisi: sayac[id] }))
      .sort((a, b) => b.eklenmeSayisi - a.eklenmeSayisi)
      .slice(0, 2); // TOP 2

    if (siraliUrunler.length === 0) {
      return res.json(null);
    }

    // Ürünlerin detaylarını ana tablodan çekiyoruz
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

// -------------------------------------------------------------
// SERVER BAŞLATMA
// -------------------------------------------------------------
app.listen(3002, () => {
  console.log("Firebase destekli sunucu 3002 portunda çalışıyor...");
});
