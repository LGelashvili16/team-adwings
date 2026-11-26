import { useEffect, useMemo } from 'react'
import { useMap } from '#/components/ui/map'
import { jobGeofenceColor, jobGeofenceRing } from '../jobs.geofence'
import type { JobGeofenceDiameter, JobMarker } from '../jobs.types'
import type { FeatureCollection, Polygon } from 'geojson'
import type { GeoJSONSource } from 'maplibre-gl'

const sourceId = 'jobs-geofences'
const fillId = 'jobs-geofences-fill'
const haloId = 'jobs-geofences-halo'
const outlineId = 'jobs-geofences-outline'

export function JobsGeofenceLayer({
  pins,
  selectedId,
  visible,
  diameter,
}: {
  pins: Array<JobMarker>
  selectedId?: string
  visible: boolean
  diameter: JobGeofenceDiameter
}) {
  const { map, loaded } = useMap()
  const data = useMemo<FeatureCollection<Polygon>>(
    () => ({
      type: 'FeatureCollection',
      features: visible
        ? pins.map((pin) => ({
            type: 'Feature',
            properties: { selected: pin.id === selectedId },
            geometry: {
              type: 'Polygon',
              coordinates: [jobGeofenceRing(pin, diameter)],
            },
          }))
        : [],
    }),
    [pins, selectedId, visible, diameter],
  )

  useEffect(() => {
    if (!loaded) return

    function restoreLayers() {
      if (
        map.getLayer(outlineId) ||
        !map.isStyleLoaded() ||
        !data.features.length
      )
        return
      if (!map.getSource(sourceId))
        map.addSource(sourceId, { type: 'geojson', data })
      // Draw above all geometry, including 3D buildings, while keeping top labels readable.
      const layers = map.getStyle().layers
      let firstTopLabel = layers.length
      while (firstTopLabel > 0 && layers[firstTopLabel - 1].type === 'symbol')
        firstTopLabel--
      const labels = layers[firstTopLabel]?.id
      map.addLayer(
        {
          id: fillId,
          source: sourceId,
          type: 'fill',
          paint: {
            'fill-color': jobGeofenceColor,
            'fill-opacity': ['case', ['get', 'selected'], 0.24, 0.13],
          },
        },
        labels,
      )
      map.addLayer(
        {
          id: haloId,
          source: sourceId,
          type: 'line',
          paint: {
            'line-color': '#ffffff',
            'line-opacity': 0.55,
            'line-width': ['case', ['get', 'selected'], 5, 3.5],
          },
        },
        labels,
      )
      map.addLayer(
        {
          id: outlineId,
          source: sourceId,
          type: 'line',
          paint: {
            'line-color': jobGeofenceColor,
            'line-width': ['case', ['get', 'selected'], 2.5, 1.5],
          },
        },
        labels,
      )
    }

    map.getSource<GeoJSONSource>(sourceId)?.setData(data)
    restoreLayers()
    // Full and diffed style changes can both discard custom sources.
    map.on('style.load', restoreLayers)
    map.on('idle', restoreLayers)
    return () => {
      map.off('style.load', restoreLayers)
      map.off('idle', restoreLayers)
    }
  }, [map, loaded, data])

  return null
}
