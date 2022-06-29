import type { Texture } from 'three'
import {
  AmbientLight,
  BackSide,
  CatmullRomCurve3,
  Clock,
  Mesh,
  MeshPhongMaterial,
  Object3D,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  TextureLoader,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { OnsetResult } from './OnsetResult'

export class TunnelScene {
  totalLength = 100 * 1600
  speed = 16000
  rotDir = 1
  pos = 0
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  curve: CatmullRomCurve3
  orb: Object3D
  aLight: AmbientLight
  clock: Clock

  constructor() {
    this.renderer = this.buildRenderer()
    this.camera = this.buildCamera()
    this.scene = new Scene()
    this.curve = this.createCurve()
    this.orb = this.buildOrb()
    this.aLight = this.buildALight()
    this.clock = new Clock()

    const loader = new TextureLoader()
    loader.load('img/stonePattern.jpg', (texture: Texture) => {
      this.buildTube(texture)
      this.render()
    })
    window.addEventListener('resize', () => this.resize())
  }

  buildRenderer() {
    const renderer = new WebGLRenderer()
    renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(renderer.domElement)
    return renderer
  }

  buildCamera() {
    const aspectRatio = window.innerWidth / window.innerHeight
    const fieldOfView = 60
    const nearPlane = 1
    const farPlane = 10000
    const camera = new PerspectiveCamera(
      fieldOfView,
      aspectRatio,
      nearPlane,
      farPlane,
    )
    camera.position.set(0, 0, -100)
    camera.rotation.y = 3.14159
    return camera
  }

  buildALight(): AmbientLight {
    const aLight = new AmbientLight('orange', 0.5) // soft white light
    this.scene.add(aLight)
    return aLight
  }

  createCurve(): CatmullRomCurve3 {
    const points = []
    points[0] = new Vector3(0, 0, 0)
    let height = 0
    let width = 0
    const seg = 100
    const length = 1600
    for (let i = 1; i <= seg; i++) {
      const angle = Math.random() * 0.3 - 0.25
      const en = length * Math.sin(angle)
      points[i] = new Vector3(
        0,
        (height += length * Math.sin(angle)),
        (width += Math.sqrt(length * length - en * en)),
      )
    }
    return new CatmullRomCurve3(points)
  }

  buildTube(texture: Texture) {
    const tubeSegments = 500
    const tubeRadius = 100
    const geometry = new TubeGeometry(
      this.curve,
      tubeSegments,
      tubeRadius,
      12,
      false,
    )
    const tubeMaterial = new MeshPhongMaterial({
      side: BackSide,
      map: texture,
    })
    if (tubeMaterial.map) {
      tubeMaterial.map.wrapS = RepeatWrapping
      tubeMaterial.map.wrapT = RepeatWrapping
      tubeMaterial.map.repeat.set(tubeSegments / 3, 2)
    }
    const mesh = new Mesh(geometry, tubeMaterial)
    this.scene.add(mesh)
  }

  buildOrb() {
    const orb = new Object3D()
    orb.position.set(0, 0, 0)
    this.scene.add(orb)
    return orb
  }

  update(time: number, analyser: OnsetResult) {
    const movement = this.speed * analyser.flux
    const change = ((40 + movement) / this.totalLength) * time
    if (analyser.event) {
      if (this.clock.getElapsedTime() > 0.1) {
        this.clock = new Clock()
        this.rotDir *= -1
      }
      this.aLight.color.r = randColor(this.aLight.color.r)
      this.aLight.color.b = randColor(this.aLight.color.b)
      this.aLight.color.g = randColor(this.aLight.color.g)
    }

    this.aLight.intensity = 0.1 + analyser.meanFlux * 4
    if (this.aLight.intensity > 1.0)
      this.aLight.intensity = 1.0

    if (this.pos + change >= 1)
      this.pos = 0
    this.orb.position.copy(this.curve.getPoint((this.pos += change) % 1))
    const ang = this.looking(
      this.curve.getPoint((this.pos + change) % 1),
      this.orb.position,
    )

    this.camera.position.z = this.orb.position.z - Math.cos(ang) * 100
    this.camera.position.y = this.orb.position.y + Math.sin(ang) * 100
    const ort = analyser.flux * 2 * time
    this.orb.rotation.z += ort * this.rotDir

    this.camera.rotation.z = -this.orb.rotation.z

    this.orb.rotation.x = ang
    this.camera.rotation.x = ang
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  looking(pointTo: Vector3, pointFrom: Vector3) {
    const vec = new Vector3()
    vec.subVectors(pointTo, pointFrom)
    return -Math.atan(vec.y / vec.z)
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.render()
  }
}

function randColor(color: number) {
  const inc = 0.15
  if (Math.random() > 0.5 && color + inc < 1)
    return color += inc
  else if (color - inc > 0)
    return color - inc
  else
    return color + inc
}

