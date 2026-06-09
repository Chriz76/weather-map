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
