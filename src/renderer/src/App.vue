<template>
  <div class="body">
    <div v-if="edits.length >= 1" id="editingHistory">
      <ul>
        <li v-for="edit in edits" :key="edit.id" @click="changeToEditedVersion(edit.id)">
          <h3>{{ edit.name }}</h3>
          <p>{{ edit.filename }}</p>
        </li>
      </ul>
    </div>
    <div id="dropZone" ref="dropZoneRef">
      <div v-if="currentlyOpenedImage && editedImage" id="openedImageContainer">
        <img
          id="openedImage"
          draggable="false"
          :style="{
            transform: `scale(${zoomAmount}) translate(${translateX}px, ${translateY}px)`,
            cursor: isPanning ? 'grabbing' : 'grab'
          }"
          :src="editedImage"
          alt="opened image"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
        />
      </div>
    </div>
    <div id="toolbar">
      <div class="action">
        <input
          id="brightnessSlider"
          v-model="brightness"
          step="1"
          min="-100"
          max="100"
          type="range"
          name="brightness"
          class="slider"
          :disabled="!currentlyOpenedImage"
          @change="updateBrightness"
        />

        <a href="#" @click.prevent="ipcHandle">Send IPC</a>
        <a href="#" @click.prevent="readoutData">Get Data</a>
        <a href="#" @click.prevent="addHelloData">Add Hello Data</a>
        <input v-model.number="num1" type="number" placeholder="Number 1" />
        <input v-model.number="num2" type="number" placeholder="Number 2" />
        <a href="#" @click.prevent="add">Add</a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDropZone } from '@vueuse/core'
import { useNavigation } from './composables/useNavigation'

// Navigation Composable
const { zoomAmount, translateX, translateY, isPanning, onMouseDown, onMouseMove, onMouseUp } =
  useNavigation()

// Editing History
interface Edit {
  id: number
  filename: string
  name: string
  image: string
}

const edits = ref<Edit[]>([])

const currentFileName = ref<string | null>(null)

const changeToEditedVersion = (id: number) => {
  const edit = edits.value.find((edit) => edit.id === id)
  if (edit) {
    editedImage.value = edit.image
  }
}

const addEditedImageToHistory = (filename: string, name: string, image: string) => {
  edits.value.push({ id: edits.value.length, filename: filename, name: name, image: image })
}

// editor functions
const brightness = ref(50)

const updateBrightness = async () => {
  console.log('Adjusting brightness to:', brightness.value)

  if (!currentlyOpenedImage.value) {
    console.warn('No image is currently opened.')
    return
  }

  const params = { brightness: brightness.value, image: currentlyOpenedImage.value }
  const result = await window.electron.ipcRenderer.invoke('changeImageBrightness', params)

  if (result.success) {
    // Update the currently opened image with the brightness-adjusted image
    editedImage.value = result.result
    console.log('Brightness adjusted successfully.')
    if (currentFileName.value) {
      addEditedImageToHistory(
        currentFileName.value,
        `Brightness: ${brightness.value}`,
        result.result
      )
    } else {
      console.error('Failed to adjust brightness:', result.error)
      return
    }
  } else {
    console.error('Failed to adjust brightness:', result.error)
    return
  }
}

// Drop Zone Setup
const dropZoneRef = ref<HTMLDivElement | null>(null)
const currentlyOpenedImage = ref<string | null>(null)
const editedImage = ref<string | null>(null)

function onDrop(files: File[] | null) {
  console.log(files)
  if (!files || files.length === 0) return

  const file = files[0]
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataURL = e.target?.result
    if (typeof dataURL === 'string') {
      currentlyOpenedImage.value = dataURL
      editedImage.value = dataURL
      currentFileName.value = file.name
      addEditedImageToHistory(currentFileName.value, `Original`, dataURL)
    }
  }
  reader.readAsDataURL(file)
}

const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop,
  dataTypes: ['image/jpeg', 'image/png'],
  preventDefaultForUnhandled: false
})

// IPC and Other Functions
const num1 = ref<number | null>(null)
const num2 = ref<number | null>(null)
// const pgSelectReturn = ref<any>(null) // Adjust the type based on actual data

const ipcHandle = async () => {
  const params = { key: 'value' }
  const result = await window.electron.ipcRenderer.invoke('ping', params)
  console.log(result) // Use the result returned from main
}

const readoutData = async () => {
  const result = await window.electron.ipcRenderer.invoke('readoutData')
  // pgSelectReturn.value = result
  console.log(result) // Use the result returned from main
}

const addHelloData = () => window.electron.ipcRenderer.send('addHelloData')

const add = async () => {
  if (num1.value === null || num2.value === null) {
    console.warn('Both numbers must be provided')
    return
  }
  const params = { numbers: [num1.value, num2.value] }
  const result = await window.electron.ipcRenderer.invoke('add', params)
  console.log(result) // Use the result returned from main
}
</script>

<style scoped>
.body {
  display: flex;
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
  color: #ffffff;
  width: 100vw;
  height: 100vh;
  flex-direction: row;
}

ul {
  list-style-type: none;
  padding: 0;
  margin: 0;
}

#dropZone {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #333333;
  overflow: hidden; /* Ensure no scrollbars appear */
}

#openedImageContainer {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden; /* Prevent content overflow */
}

#openedImage {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform 0.2s ease;
  touch-action: none;
}

#editingHistory {
  top: 20px;
  left: 20px;
  display: flex;
  background-color: #393939;
  width: 300px;
  overflow-y: scroll;
  padding: 10px;

  ul {
    width: 100%;
    li {
      background-color: #333333;
      border: #333333 solid 1px;
      padding: 5px;
      margin-bottom: 5px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      p {
        font-size: 8px;
      }
    }
  }
}

#toolbar {
  position: fixed;
  bottom: 0;
  left: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;
  background-color: #333333;
  width: 100%;
  padding: 10px;
}

#toolbar .action a {
  margin-right: 15px;
  color: #ffffff;
  text-decoration: none;
  cursor: pointer;
}

#toolbar .action input {
  margin-right: 10px;
}

.pgSelects {
  /* Add any necessary styles for pgSelects */
}

.pgSelectReturn {
  color: #ffffff;
}
</style>
