import store from '@/store'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { ISceneNode } from '@/core/scene/iscene'
import { useEffect, useRef, forwardRef } from 'react'
// @ts-expect-error no declare file for rectangle mode
import DrawRectangle from 'mapbox-gl-draw-rectangle-mode'
import { calculateRectangleCoordinates } from './utils'
import NHLayerGroup from './NHLayerGroup'

const initialLongitude = 114.051537
const initialLatitude = 22.446937
const initialZoom = 11
const maxZoom = 22

export interface DrawCreateEvent {
    features: Array<GeoJSON.Feature>
    type: string
}

export interface MapContainerProps {
    style?: string
    node: ISceneNode | null
}

const debounce = (func: (...args: any[]) => void, delay: number) => {
    let timeoutId: NodeJS.Timeout
    return (...args: any[]) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
            // func(...args)
        }, delay)
    }
}

const MapContainer = forwardRef<MapboxDraw, MapContainerProps>((props, ref) => {
    const { style, node } = props
    const mapWrapperRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        mapboxgl.accessToken = import.meta.env.VITE_MAP_TOKEN
        let mapInstance: mapboxgl.Map
        let resizer: ResizeObserver | null = null
        let drawInstance: MapboxDraw | null = null

        let isProcessingDrawEvent = false
        const handleDrawCreate = (e: any) => {
            if (isProcessingDrawEvent) return
            
            isProcessingDrawEvent = true
            try {
                if (e.features && e.features.length > 0) {
                    const feature = e.features[0];
                    if (feature.geometry.type === 'Polygon') {
                        const coordinates = calculateRectangleCoordinates(feature)
                        const drawCompleteEvent = new CustomEvent('rectangle-draw-complete', {
                            detail: { coordinates }
                        })
                        document.dispatchEvent(drawCompleteEvent)
                        if (drawInstance) {
                            drawInstance.changeMode('simple_select')
                        }
                    }
                }
            } finally {
                isProcessingDrawEvent = false
            }
        }

        if (mapWrapperRef.current) {
            mapInstance = new mapboxgl.Map({
                container: mapWrapperRef.current,
                style: 'mapbox://styles/mapbox/streets-v12',
                projection: 'globe',
                center: [initialLongitude, initialLatitude],
                zoom: initialZoom,
                maxZoom: maxZoom,
                attributionControl: false,
                boxZoom: false,
            })
            mapInstance.on('load', async() => {
                const layerGroup = new NHLayerGroup()
                layerGroup.id = 'gridman-custom-layer-group'
                node && await node.scenarioNode.handleMapAdd(node, mapInstance, layerGroup)
                mapInstance.addLayer(layerGroup)
            })
            store.set('map', mapInstance)

            mapInstance.on('style.load', () => {
                mapInstance.setFog({})
            })

            drawInstance = new MapboxDraw({
                displayControlsDefault: false,
                boxSelect: false,
                modes: {
                    ...MapboxDraw.modes,
                    draw_rectangle: DrawRectangle,
                }
            })
            store.set('mapDraw', drawInstance)

            mapInstance.addControl(drawInstance)
            mapInstance.on('draw.create', handleDrawCreate)

            const currentMapInstance = mapInstance
            resizer = new ResizeObserver(
                debounce(() => {
                    currentMapInstance?.resize()
                }, 100)
            )
            resizer.observe(mapWrapperRef.current)
        }

        return () => {
            if (resizer && mapWrapperRef.current) {
                // eslint-disable-next-line react-hooks/exhaustive-deps
                resizer.unobserve(mapWrapperRef.current)
                resizer.disconnect()
            }
            if (mapInstance) {
                if (drawInstance) {
                    mapInstance.removeControl(drawInstance)
                    mapInstance.off('draw.create', handleDrawCreate)
                }
                mapInstance.remove()
                store.set('map', null)
                store.set('mapDraw', null)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div className={style ?? 'relative w-full h-full'} ref={mapWrapperRef} />
    )
})

export default MapContainer