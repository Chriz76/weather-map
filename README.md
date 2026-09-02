# Interactive DWD ICON-D2 RUC & AROME PI Wind Map
[![Live App](https://img.shields.io/badge/Live-Demo-blue?style=flat-square)](https://chriz76.github.io/weather-map/)
[![Data Pipeline Repo](https://img.shields.io/badge/Data-Repository-green?style=flat-square)](https://github.com/Chriz76/weather-data)

The app visualizes localized wind forecast data for **Germany**, **France** and nearby regions. You can switch between **ICON-D2 RUC** and **AROME PI** using the logo row.

[![App Screenshot](public/Screenshot_20260814-120701_Chrome.png)](https://chriz76.github.io/weather-map/)

The project uses the **ICON-D2 RUC (Rapid Update Cycle)** model provided by the Deutscher Wetterdienst (DWD) and **AROME PI** via Open-Meteo using Météo-France model data. The map overlay utilizes a custom color-scale optimized for the specific velocity ranges relevant to kite and wing foiling.

To our knowledge, this is a **unique free implementation** providing hourly updated, interactive point-forecast queries from these high-resolution models.

[See my article on medium for some more background](https://medium.com/@christianzink/why-standard-wind-forecasts-fail-the-power-of-dwds-icon-d2-ruc-model-for-wind-sports-acf2ebd88412?sharedUserId=christianzink)

[Related: kitespots.zink.tv](https://kitespots.zink.tv)

> ⚠️ **Disclaimer:** Always check the local weather at your spot. Forecasts can be wrong. This project is currently in active development.

---

## Technical Specifications & Advantages of ICON-D2 RUC / Arome PI
Most mainstream consumer weather applications render global or regional models with coarse resolution and slow update cycles. This application visualizes premier high-resolution local models:

| Parameter | ICON-D2 RUC / Arome PI | Standard Global Models (e.g., GFS) |
| :--- | :--- | :--- |
| **Horizontal Resolution** | **2.2/2.5(1.3) km** grid | 13 km – 27 km grid |
| **Update Cycle** | **Hourly (Every 60 minutes)** | Every 6 hours |
| **Interval** | **60/15 min** | 60-360 min |
| **Data Assimilation** | **Rapid Update Cycle (RUC)** (Continuous assimilation of local radar & station observations) | Intermittent batch assimilation |
| **Forecast Range** | 28/6 hours | Multi-day extended range |

Arome base wind is only available in the 2.5 km dataset. The forecasts use the 1.3 km resolution for gusts.

### Application for Foiling:

Micro-climatic shifts, thermal winds, and localized frontal systems near lakes or coastal structures are typically lost in >10km grids. The 2.2/2.5(1.3) km resolution of the ICON-D2 RUC/Arome PI model captures these thermodynamic anomalies. Updating the dataset hourly ensures near-term tactical wind window forecasts remain accurate.

AROME PI 2.5/1.3 km adds another high-resolution option for nearby regions via Open-Meteo and Météo-France model data.

---

## Architecture & Data Pipeline

The project implements a decoupled, entirely serverless **Two-Repository Architecture** to eliminate backend hosting costs while maintaining high data throughput.


### 1. Data Ingestion & Extraction (`weather-data`)
* **Pipeline Branch (`main`):** A Python-based script triggered hourly via GitHub Actions fetches the latest GRIB2 payload from the DWD Open Data servers and from Open-Meteo.
* **Processing:** The pipeline crops the dataset to the target geographic bounding box, extracts wind speed arrays, and serializes the matrix data.
* **Storage Branch (`gh-pages`):** The extracted data slices are pushed as static JSON structures to the [gh-pages branch](https://github.com/Chriz76/weather-data/tree/gh-pages), acting as a decentralized, free-tier CDN.

### 2. Frontend Visualization (`weather-map`)
* The client-side application loads the lightweight spatial arrays on-demand based on the user's selected timeline node.
* **Coordinate Interpolation:** When a user interacts with the map interface, the application translates the mouse pointer's geospatial coordinate (Latitude/Longitude) to extract the precise point-forecast value from the underlying data matrix.

---

## Development & Contribution

As this is an actively developed project, contributions to optimize the JSON chunking sizes, add more rapid models like HRRR or Netherlands Harmonie, improve the UI performance under heavy mobile rendering conditions, or add vector-based wind direction overlays or WebGL are welcome.

This project is a private, free, and ad-free open-source web app. It is maintained strictly for hobby purposes and pursues no commercial interests.

* **Data Attribution:** Deutscher Wetterdienst (DWD) - OpenData.
* **AROME Attribution:** [Open-Meteo](https://open-meteo.com/) using [Météo-France](https://meteofrance.com/) model data.
* **Author:** [Chriz76](https://github.com/Chriz76)

## 📄 License & Terms of Use

* **Meteorological Data Source:** Deutscher Wetterdienst (DWD) – OpenData terms apply to the underlying forecast parameters.
* **Software License:** Copyright © 2026 by Chriz76. All rights reserved. 
  
This application is provided **free of charge** for personal and recreational use (e.g., wind/wing foiling planning). However, the source code, custom processing pipelines, and frontend logic remain the intellectual property of the author. You may not redistribute, modify, or commercially exploit this codebase without explicit written permission.

## Privacy Policy

Because your privacy matters, this web app does not collect, store, or track any of your personal data. We do not use any marketing or tracking cookies, and there is no user registration required to use this app.

However, to provide this web app in a stable, secure, and fast manner, we rely on modern cloud infrastructure. Due to technical requirements, a minimal amount of data processing occurs automatically in the background:

### 1. Hosting via GitHub Pages
This web app is hosted as a static site on GitHub Pages (Service Provider: GitHub Inc., 88 Colin P Kelly Jr St, San Francisco, CA 94107, USA; Parent Company: Microsoft Corporation). When you access this app, GitHub automatically collects standard server log files (including your IP address, browser type, and the date and time of access). This is technically necessary to deliver the page securely and to prevent cyber attacks. GitHub/Microsoft is certified under the EU-US Data Privacy Framework, ensuring a GDPR-compliant level of data protection.

### 2. Security & Content Delivery Network via Cloudflare
Additionally, we use the Content Delivery Network (CDN) provided by Cloudflare (Service Provider: Cloudflare Inc., 101 Townsend St, San Francisco, CA 94107, USA). Cloudflare acts as a security shield between our host server and your browser. During this process, your IP address is briefly processed to block malicious traffic (e.g., DDoS attacks) and to optimize page loading speeds globally. Cloudflare may set technically necessary cookies for security purposes, which do not create user profiles. Cloudflare is also certified under the EU-US Data Privacy Framework.

**Legal Basis:** The use of these third-party services is based on our legitimate interest (Art. 6 Abs. 1 lit. f GDPR) to offer this hobby project in a secure, high-performing, and reliable manner on the internet.
