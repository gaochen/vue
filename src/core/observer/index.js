/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    // 在vue上新增一个不可枚举的__ob__属性, 这个属性的值就是Observer实例
    // 因此我们就可以通过数组数据__ob__获取Observer实例
    // 进而获取__ob__上的dep
    // 所以只要数据被监听了就一定会有ob的标记 
    def(value, '__ob__', this)
    // 重新封装数组方法
    if (Array.isArray(value)) {
      // 是否支持__proto__
      if (hasProto) {
        // 支持：直接把原型指向新定义的数组方法arrayMethods
        protoAugment(value, arrayMethods)
      } else {
        // 不支持：直接把新的数组方法添加到本身
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
   // value已经是一个响应式数据就不再创建Observe实例, 避免重复侦听
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
     // 创建一个Observer实例
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // dep在访问器属性中闭包使用
  // 每一个数据字段都通过闭包引用着属于自己的 dep 常量
  // 每个字段的Dep对象都被用来收集那些属于对应字段的依赖。
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  // 边界情况处理： 一个不可配置的属性是不能使用也没必要使用 Object.defineProperty 改变其属性定义的。
  if (property && property.configurable === false) {
    return
  }

  // 由于一个对象的属性很可能已经是一个访问器属性了，所以该属性很可能已经存在 get 或 set 方法
  // 如果接下来会使用 Object.defineProperty 函数重新定义属性的 setter/getter
  // 这会导致属性原有的 set 和 get 方法被覆盖，所以要将属性原有的 setter/getter 缓存
  const getter = property && property.get
  const setter = property && property.set
  // 边界情况处理
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 默认就是深度观测，引用子属性的__ob__
  // 为Vue.set 或 Vue.delete 方法提供触发依赖。
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 如果 getter 存在那么直接调用该函数，并以该函数的返回值作为属性的值，保证属性的原有读取操作正常运作
      // 如果 getter 不存在则使用 val 作为属性的值
      const value = getter ? getter.call(obj) : val
      // Dep.target的值是在对Watch实例化时候赋值的
      if (Dep.target) {
        // 开始收集依赖到dep
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            // 调用 dependArray 函数逐个触发数组每个元素的依赖收集
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      // 获取原来的值
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // 比较新旧值是否相等, 考虑NaN情况
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      // 如果数据之前有setter, 那么应该继续使用该函数来设置属性的值
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 由于属性被设置了新的值，那么假如我们为属性设置的新值是一个数组或者纯对象，
      // 那么该数组或纯对象是未被观测的，所以需要对新值进行观测
      childOb = !shallow && observe(newVal)
      // 通知dep中的watcher更新
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
