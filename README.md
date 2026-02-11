# Leaflet utilities

This repository contains small Leaflet prototypes that run entirely in the browser.

## RGB image segmentation

`leaflet_rgb_segmentation.html` hosts an interactive RGB segmentation playground. Upload any
image, choose the number of clusters, and let the built-in K-means implementation generate a
segmentation overlay. The image is rendered inside a Leaflet map using the `CRS.Simple`
coordinate system so you can pan, zoom, and toggle between the original image and the segmented
result.

Key capabilities:

- Adjustable number of K-means clusters (2–12).
- Automatic down-scaling to a configurable maximum dimension for faster processing.
- Layer opacity control to blend between original and segmented imagery.
- Legend summarising segment colours, pixel counts, and percentages.

Open the file directly in a modern browser to get started—no build step required.

## Shapefile loader

`leaflet_shp.html` demonstrates how to load zipped shapefile components on top of a Leaflet
map using `shp.js`. Provide the `.shp`, `.shx`, and `.dbf` files together to visualise their
contents in the browser.
