# Interactive DWD ICON-D2 RUC Wind Map
[![Live App](https://img.shields.io/badge/Live-Demo-blue?style=flat-square)](https://chriz76.github.io/weather-map/)
[![Data Pipeline Repo](https://img.shields.io/badge/Data-Repository-green?style=flat-square)](https://github.com/Chriz76/weather-data)

The app visualizes localized wind forecast data for **Germany**. With the highest **resolution of 2.2 km** and the **most frequent hourly updates**. 

The project uses the new **ICON-D2 RUC (Rapid Update Cycle)** model provided by the Deutscher Wetterdienst (DWD). The map overlay utilizes a custom color-scale optimized for the specific velocity ranges relevant to kite and wing foiling.

To our knowledge, this is a **unique free implementation** providing hourly updated, interactive point-forecast queries directly from the ICON-D2 RUC.

> ⚠️ **Disclaimer:** This project is experimental and currently in active development.
---

## Technical Specifications & Advantages of ICON-D2 RUC
Most mainstream consumer weather applications render global or regional models with coarse resolution and slow update cycles. This application visualizes the DWD's premier high-resolution local model:

| Parameter | ICON-D2 RUC | Standard Global Models (e.g., GFS) |
| :--- | :--- | :--- |
| **Horizontal Resolution** | **2.1 km** grid | 13 km – 27 km grid |
| **Update Cycle** | **Hourly (Every 60 minutes)** | Every 6 hours |
| **Data Assimilation** | **Rapid Update Cycle (RUC)** (Continuous assimilation of local radar & station observations) | Intermittent batch assimilation |
| **Forecast Range** | 0 to 14 hours | Multi-day extended range |

### Application for Foiling:

Micro-climatic shifts, thermal winds, and localized frontal systems near lakes or coastal structures are typically lost in >10km grids. The 2.1 km resolution of the ICON-D2 RUC model captures these thermodynamic anomalies. Updating the dataset hourly ensures near-term tactical wind window forecasts remain accurate.
---

## Architecture & Data Pipeline

The project implements a decoupled, entirely serverless **Two-Repository Architecture** to eliminate backend hosting costs while maintaining high data throughput.


### 1. Data Ingestion & Extraction (`weather-data`)
* **Pipeline Branch (`main`):** A Python-based script triggered hourly via GitHub Actions fetches the latest GRIB2 payload from the DWD Open Data servers.
* **Processing:** The pipeline crops the dataset to the target geographic bounding box, extracts wind speed arrays, and serializes the matrix data.
* **Storage Branch (`gh-pages`):** The extracted data slices are pushed as static JSON structures to the [gh-pages branch](https://github.com/Chriz76/weather-data/tree/gh-pages), acting as a decentralized, free-tier CDN.

### 2. Frontend Visualization (`weather-map`)
* The client-side application loads the lightweight spatial arrays on-demand based on the user's selected timeline node.
* **Coordinate Interpolation:** When a user interacts with the map interface, the application translates the mouse pointer's geospatial coordinate (Latitude/Longitude) to extract the precise point-forecast value from the underlying data matrix.

---

## Development & Contribution

As this is an experimental project, contributions to optimize the JSON chunking sizes, improve the UI performance under heavy mobile rendering conditions, or add vector-based wind direction overlays are welcome. 

* **Data Attribution:** Deutscher Wetterdienst (DWD) - OpenData.
* **Author:** [Chriz76](https://github.com/Chriz76)

## 📄 License & Terms of Use

* **Meteorological Data Source:** Deutscher Wetterdienst (DWD) – OpenData terms apply to the underlying forecast parameters.
* **Software License:** Copyright © 2026 by Chriz76. All rights reserved. 
  
This application is provided **free of charge** for personal and recreational use (e.g., wind/wing foiling planning). However, the source code, custom processing pipelines, and frontend logic remain the intellectual property of the author. You may not redistribute, modify, or commercially exploit this codebase without explicit written permission.

