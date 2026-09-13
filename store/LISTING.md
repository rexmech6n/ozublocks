# Chrome Web Store listing: OzUBlocks

Copy each block into the matching field in the Developer Dashboard.

## Store listing tab

**Name** (comes from `manifest.json`)

```
OzUBlocks
```

**Summary** (comes from `manifest.json`, 132 characters max)

```
Turn every class into a calendar block. Özyeğin SIS ders programınızı takvime aktarır. Üniversite ile resmî bir bağlantısı yoktur.
```

**Description**

```
Turn every class into a calendar block.

OzUBlocks, Özyeğin Üniversitesi SIS'teki haftalık ders programınızı okur ve dönem boyunca her hafta tekrar eden bir takvim dosyasına (.ics) çevirir. Dosyayı Google Takvim, Apple Takvim veya Outlook'a içe aktarabilirsiniz.

Nasıl çalışır:
• SIS'e giriş yapın ve eklentiyi açın.
• "Derslerimi Tara" butonuna basın. Eklenti Ders Programım ekranını kendisi açar ve derslerinizi listeler.
• Almadığınız dersleri ve salonları işaretten çıkarın.
• "Takvim dosyasını indir" butonuna basın ve dosyayı takviminize aktarın.

Özellikler:
• Dönem başlangıç ve bitiş tarihleri hazır gelir, isterseniz değiştirebilirsiniz.
• Resmî tatillere denk gelen dersler takvime eklenmez.
• Aynı ders birden fazla salonda görünüyorsa sizi uyarır.

Gizlilik:
Tüm işlem bilgisayarınızda yapılır. Ders programınız hiçbir sunucuya gönderilmez, eklenti hiçbir veri toplamaz.

OzUBlocks bağımsız bir öğrenci projesidir. Özyeğin Üniversitesi ile resmî bir bağlantısı yoktur.
```

**Category:** Education (if not listed, use Productivity)

**Language:** Turkish

**Graphics**

| Field | File |
|---|---|
| Store icon (128×128) | `icons/icon128.png` |
| Screenshot (1280×800) | `store/screenshot-1280x800.png` |
| Small promo tile (440×280) | `store/promo-440x280.png` |

## Privacy practices tab

**Single purpose**

```
Reads the student's weekly course schedule from Özyeğin University SIS (sis.ozyegin.edu.tr) and exports it as a recurring .ics calendar file.
```

**Permission justification: `scripting`**

```
The popup injects a script into the SIS page when the user clicks the button. The script reads the schedule records from the SIS calendar widget and opens the "Ders Programım" screen through the SIS menu. It runs only on sis.ozyegin.edu.tr and only after a user click.
```

**Permission justification: `storage`**

```
Saves the term start and end dates that the user picks, so the popup shows them again next time. The data stays in chrome.storage.local on the device.
```

**Permission justification: host permission `https://sis.ozyegin.edu.tr/*`**

```
The schedule exists only on the SIS website. The extension needs access to this one site to read the schedule. It requests no other site.
```

**Remote code:** No, I am not using remote code.

**Data usage**

- Mark **Website content**. The extension reads course names, times, and rooms from the SIS page.
- Leave all other data types unmarked.
- Check all three certifications:
  - I do not sell or transfer user data to third parties.
  - I do not use or transfer user data for purposes unrelated to the single purpose.
  - I do not use or transfer user data to determine creditworthiness or for lending.

**Privacy policy URL:** publish `store/PRIVACY.md` at a public URL (for example a public GitHub repo or gist), then paste that URL here.
