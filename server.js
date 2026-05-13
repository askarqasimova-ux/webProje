const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json()); // HTML'den gelen JSON verilerini okuyabilmek için ŞART!

const sqlBaglanti = {
  user: "aydin",
  password: "Goldmaster150.",
  server: "localhost",
  database: "projeDB",
  trustServerCertificate: true,
};

// 1. ÜRÜNLERİ GETİR
app.get("/api/dbUrunler", async (req, res) => {
  try {
    let havuz = await sql.connect(sqlBaglanti);
    let sonuc = await havuz
      .request()
      .query("SELECT id, image, ad, info, fiyat FROM dbo.urunler");
    res.json(sonuc.recordset);
  } catch (hata) {
    console.log("SQL Hatası:", hata);
    res.status(500).send("Sunucu hatası");
  }
});

// 2. KULLANICI KAYIT OL
app.post("/api/kayit", async (req, res) => {
  try {
    let { ad, sifre } = req.body;
    let havuz = await sql.connect(sqlBaglanti);

    // Kullanıcı var mı kontrol et
    let kontrol = await havuz
      .request()
      .input("ad", sql.NVarChar, ad)
      .query("SELECT * FROM kullanicilar WHERE ad = @ad");
    if (kontrol.recordset.length > 0)
      return res.status(400).json({ mesaj: "Bu kullanıcı zaten var!" });

    await havuz
      .request()
      .input("ad", sql.NVarChar, ad)
      .input("sifre", sql.NVarChar, sifre)
      .query("INSERT INTO kullanicilar (ad, sifre) VALUES (@ad, @sifre)");

    res.json({ mesaj: "Kayıt başarılı!" });
  } catch (hata) {
    console.log("Kayıt Hatası:", hata);
    res.status(500).send("Sunucu hatası");
  }
});

// 3. KULLANICI GİRİŞ YAP
app.post("/api/giris", async (req, res) => {
  try {
    let { ad, sifre } = req.body;
    let havuz = await sql.connect(sqlBaglanti);
    let sonuc = await havuz
      .request()
      .input("ad", sql.NVarChar, ad)
      .input("sifre", sql.NVarChar, sifre)
      .query("SELECT * FROM kullanicilar WHERE ad = @ad AND sifre = @sifre");

    if (sonuc.recordset.length > 0) res.json({ basarili: true });
    else res.json({ basarili: false });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

// 4. BİLGİLERİ GÜNCELLE
app.put("/api/guncelle", async (req, res) => {
  try {
    let { eskiAd, yeniAd, yeniSifre } = req.body;
    let havuz = await sql.connect(sqlBaglanti);

    // Kullanıcı adını ve şifreyi güncelle
    await havuz
      .request()
      .input("eskiAd", sql.NVarChar, eskiAd)
      .input("yeniAd", sql.NVarChar, yeniAd)
      .input("yeniSifre", sql.NVarChar, yeniSifre)
      .query(
        "UPDATE kullanicilar SET ad = @yeniAd, sifre = @yeniSifre WHERE ad = @eskiAd",
      );

    // Kullanıcının sepetindeki adları da yeni adıyla güncelle
    await havuz
      .request()
      .input("eskiAd", sql.NVarChar, eskiAd)
      .input("yeniAd", sql.NVarChar, yeniAd)
      .query(
        "UPDATE sepet SET kullanici_ad = @yeniAd WHERE kullanici_ad = @eskiAd",
      );

    res.json({ mesaj: "Güncellendi" });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

// 5. KULLANICININ SEPETİNİ GETİR
app.get("/api/sepet/:kullanici", async (req, res) => {
  try {
    let havuz = await sql.connect(sqlBaglanti);
    let sonuc = await havuz
      .request()
      .input("ad", sql.NVarChar, req.params.kullanici)
      // Sepet tablosundaki urun_id ile urunler tablosunu birleştirip bilgileri çekiyoruz
      .query(
        "SELECT u.id, u.ad, u.fiyat, u.image FROM sepet s JOIN urunler u ON s.urun_id = u.id WHERE s.kullanici_ad = @ad",
      );
    res.json(sonuc.recordset);
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

// 6. SEPETE ÜRÜN EKLE
app.post("/api/sepet/ekle", async (req, res) => {
  try {
    let { kullanici, urunId } = req.body;
    let havuz = await sql.connect(sqlBaglanti);
    await havuz
      .request()
      .input("ad", sql.NVarChar, kullanici)
      .input("urunId", sql.Int, urunId)
      .query("INSERT INTO sepet (kullanici_ad, urun_id) VALUES (@ad, @urunId)");
    res.json({ mesaj: "Eklendi" });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

// 7. SEPETTEN ÜRÜN SİL
app.delete("/api/sepet/sil/:kullanici/:urunId", async (req, res) => {
  try {
    let havuz = await sql.connect(sqlBaglanti);
    // İlgili üründen sadece 1 tanesini siler (TOP 1)
    await havuz
      .request()
      .input("ad", sql.NVarChar, req.params.kullanici)
      .input("urunId", sql.Int, req.params.urunId)
      .query(
        "DELETE TOP(1) FROM sepet WHERE kullanici_ad = @ad AND urun_id = @urunId",
      );
    res.json({ mesaj: "Silindi" });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

// 8. ONAYLA (SEPETİ TEMİZLE)
app.delete("/api/sepet/temizle/:kullanici", async (req, res) => {
  try {
    let havuz = await sql.connect(sqlBaglanti);
    await havuz
      .request()
      .input("ad", sql.NVarChar, req.params.kullanici)
      .query("DELETE FROM sepet WHERE kullanici_ad = @ad");
    res.json({ mesaj: "Sepet temizlendi" });
  } catch (hata) {
    res.status(500).send("Sunucu hatası");
  }
});

app.get("/api/populer-urun", async (req, res) => {
  try {
    let havuz = await sql.connect(sqlBaglanti);

    // SQL'in kalbi burası: Sepetteki urun_id'leri gruplayıp sayıyoruz
    let sorgu = `
            SELECT TOP 2
                u.id, 
                u.ad, 
                u.fiyat, 
                u.image, 
                COUNT(s.urun_id) AS eklenmeSayisi 
            FROM sepet s
            JOIN urunler u ON s.urun_id = u.id
            GROUP BY u.id, u.ad, u.fiyat, u.image
            ORDER BY eklenmeSayisi DESC
        `;

    let sonuc = await havuz.request().query(sorgu);

    // Eğer sepet tablosu boşsa null gönder, değilse en çok eklenen ilk ürünü gönder
    if (sonuc.recordset.length > 0) {
      res.json(sonuc.recordset);
    } else {
      res.json(null);
    }
  } catch (hata) {
    console.log("SQL Hatası:", hata);
    res.status(500).send("Sunucu hatası");
  }
});

app.listen(3002, () => {
  console.log("Sunucu çalışıyor...");
});
