// scripts/navigation.ts
import { ref, onMounted, onUnmounted } from 'vue'

export function useNavigation() {
  // Refs for zoom and panning
  const zoomAmount = ref(1)
  const translateX = ref(0)
  const translateY = ref(0)
  const isPanning = ref(false)
  let startX = 0
  let startY = 0

  // Handle Zooming
  const handleWheel = (event: WheelEvent) => {
    if (event.metaKey) {
      event.preventDefault()
      zoomAmount.value += event.deltaY * -0.01
      zoomAmount.value = Math.min(Math.max(zoomAmount.value, 0.1), 10) // constrain between 0.1 and 10
      console.log('Zoom Amount:', zoomAmount.value)
    }
  }

  // Handle Key Down for Panning
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      isPanning.value = true
      console.log('Panning Enabled')
    }
  }

  // Handle Key Up for Panning
  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      isPanning.value = false
      console.log('Panning Disabled')
    }
  }

  // Handle Mouse Down to Start Panning
  const onMouseDown = (event: MouseEvent) => {
    if (isPanning.value) {
      startX = event.clientX - translateX.value
      startY = event.clientY - translateY.value
    }
  }

  // Handle Mouse Move to Pan Image
  const onMouseMove = (event: MouseEvent) => {
    if (isPanning.value && event.buttons === 1) {
      translateX.value = event.clientX - startX
      translateY.value = event.clientY - startY
    }
  }

  // Handle Mouse Up to Stop Panning (Optional)
  const onMouseUp = () => {
    if (isPanning.value) {
      isPanning.value = false
      console.log('Panning Stopped')
    }
  }

  // Register Event Listeners on Mount
  onMounted(() => {
    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mouseup', onMouseUp)
  })

  // Clean Up Event Listeners on Unmount
  onUnmounted(() => {
    window.removeEventListener('wheel', handleWheel)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('mouseup', onMouseUp)
  })

  return {
    zoomAmount,
    translateX,
    translateY,
    isPanning,
    onMouseDown,
    onMouseMove,
    onMouseUp
  }
}
