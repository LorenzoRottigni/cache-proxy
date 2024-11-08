
import { Redis } from 'ioredis'

export const getBase64key = (args: any, funcName: string | symbol, className?: string | symbol) =>
    Buffer.from(
      JSON.stringify([
        className ? `${String(className)}.${String(funcName)}` : funcName,
        ...args.filter((arg: any) => !('apiType' in arg)),
      ]),
    ).toString('base64')
  

const redis = new Redis({
  host: 'vendure_redis',
  port: 6379,
})

export function cacheableFunction<T extends (...args: any[]) => any>(
  fn: T,
  funcName: symbol | string,
  className?: symbol | string,
  ttlSeconds?: number,
): T {
  return async function (...args: any[]) {
    const key = getBase64key(args, funcName, className)
    const cachedResult = await redis.get(key)
    if (cachedResult) return JSON.parse(cachedResult)

    const result = fn(...args)
    const finalResult = result instanceof Promise ? await result : result
    await redis.set(key, JSON.stringify(finalResult), 'EX', ttlSeconds || 20)
    return finalResult
  } as T
}

export function injectCache<T extends object>(e: T, ttlSeconds: number) {
  return new Proxy(e, {
    get(target, prop, receiver) {
      const originalFunction = target[prop as keyof T]

      if (typeof originalFunction === 'function') {
        const cachedFunction = cacheableFunction(
          originalFunction.bind(target),
          prop,
          target?.constructor?.name,
          ttlSeconds,
        )
        Reflect.set(target, prop, cachedFunction)
        return cachedFunction
      }

      return Reflect.get(target, prop, receiver)
    },
  })
}
