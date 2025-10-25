# 🧠 VoxTrace — Bot Discord de suivi vocal complet

## 💬 Présentation

**VoxTrace** est un bot Discord avancé qui **enregistre toute l’activité vocale** d’un serveur :  
> Entrées / sorties, mute, caméra, partage d’écran, etc.

Il affiche les logs en direct dans Discord, sauvegarde toutes les données en `.json`,  
et fournit des **statistiques détaillées** pour les administrateurs et les utilisateurs.

---

## ⚙️ Fonctionnalités principales

### 🧩 Auto-configuration
Lors de l’ajout sur un serveur, le bot crée automatiquement une **catégorie `VoxTrace`** contenant deux salons :

- `#voxtrace-logs` → logs en direct  
- `#voxtrace-fichiers` → fichiers `.json`

🛡️ Ces salons sont **privés**, visibles uniquement pour le bot et les rôles contenant `admin`  
(ex : `Admin`, `Administrateur`, `Super Admin`, etc.)

🧹 **Nettoyage automatique** :  
Quand le bot quitte un serveur, il supprime **la catégorie `VoxTrace`** et les fichiers associés.

---

### 📊 Suivi vocal complet
Le bot détecte en **temps réel** :

- Connexion / déconnexion d’un salon vocal  
- Mute / unmute  
- Casque coupé / remis  
- Caméra allumée / éteinte  
- Partage d’écran démarré / arrêté (avec durée)

💾 **Sauvegarde JSON**  
Chaque salon vocal possède un fichier `.json` dans le dossier `/logs/`.

📈 **Statistiques détaillées**
- 🎙️ Temps vocal total  
- 🔇 Temps mute  
- 🎧 Temps casque  
- 📷 Temps caméra  
- 🖥️ Temps de partage d’écran  

---

### 🧭 Commandes interactives

Des boutons permettent de changer de période ou de page sans retaper la commande.

### 🧰 Personnalisation admin

Les administrateurs peuvent redéfinir les salons avec :  
/setlogchannel
/setlogfichier

## 🏷️ Tags

![Discord](https://img.shields.io/badge/Discord-7289DA?logo=discord&logoColor=white)
![Bot](https://img.shields.io/badge/Discord%20Bot-blueviolet)
![Voice Tracker](https://img.shields.io/badge/Voice%20Tracker-ff69b4)
![Logs](https://img.shields.io/badge/Voice%20Logs-orange)
![Statistics](https://img.shields.io/badge/Statistics-00bfa6)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-f7df1e?logo=javascript&logoColor=black)
![JSON](https://img.shields.io/badge/JSON-333?logo=json&logoColor=white)
![Admin Tool](https://img.shields.io/badge/Admin%20Tool-9b59b6)
![Real Time](https://img.shields.io/badge/Real%20Time-3498db)
![Monitoring](https://img.shields.io/badge/Monitoring-2ecc71)
![VoxTrace](https://img.shields.io/badge/VoxTrace-1abc9c)


---

## 🚀 Installation

Clone le projet :
```bash
git clone https://github.com/Eclips-GH/voxtrace.git


