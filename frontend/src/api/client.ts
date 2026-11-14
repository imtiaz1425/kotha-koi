import { apiErrorSchema, ErrorCode } from '@kothakoi/shared'

export class ApiClientError extends Error {
  public readonly status: number
  public readonly code: ErrorCode | 'UNKNOWN_ERROR' | 'NETWORK_ERROR'
  public readonly details?: Record<string, unknown>

  constructor(params: {
    status: number
    code: ErrorCode | 'UNKNOWN_ERROR' | 'NETWORK_ERROR'
    message: string
    details?: Record<string, unknown>
  }) {
    super(params.message)
    this.name = 'ApiClientError'
    this.status = params.status
    this.code = params.code
    this.details = params.details
  }
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
}

export class ApiClient {
  private readonly baseUrl: string

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const url = `${this.baseUrl}${cleanPath}`
    if (!params) return url

    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value))
      }
    }
    const queryString = searchParams.toString()
    return queryString ? `${url}?${queryString}` : url
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { params, headers, ...customConfig } = options
    const url = this.buildUrl(path, params)

    const config: RequestInit = {
      credentials: 'include', // Ensure server-managed HttpOnly session cookie is transmitted
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      ...customConfig,
    }

    let response: Response
    try {
      response = await fetch(url, config)
    } catch {
      throw new ApiClientError({
        status: 0,
        code: 'NETWORK_ERROR',
        message:
          'Unable to reach the server. Please check your network connection.',
      })
    }

    // HTTP 204 No Content
    if (response.status === 204) {
      return undefined as unknown as T
    }

    const contentType = response.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')

    if (!response.ok) {
      if (isJson) {
        try {
          const errorJson = await response.json()
          const parsed = apiErrorSchema.safeParse(errorJson)
          if (parsed.success) {
            throw new ApiClientError({
              status: response.status,
              code: parsed.data.error.code,
              message: parsed.data.error.message,
              details: parsed.data.error.details,
            })
          }
        } catch (e) {
          if (e instanceof ApiClientError) throw e
        }
      }

      throw new ApiClientError({
        status: response.status,
        code: response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL',
        message: `Request failed with status ${response.status}`,
      })
    }

    if (!isJson) {
      return (await response.text()) as unknown as T
    }

    return (await response.json()) as T
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const headers: Record<string, string> = {}
    let serializedBody: string | undefined

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      serializedBody = JSON.stringify(body)
    }

    return this.request<T>(path, {
      ...options,
      method: 'POST',
      headers: {
        ...headers,
        ...options?.headers,
      },
      body: serializedBody,
    })
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const headers: Record<string, string> = {}
    let serializedBody: string | undefined

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      serializedBody = JSON.stringify(body)
    }

    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      headers: {
        ...headers,
        ...options?.headers,
      },
      body: serializedBody,
    })
  }

  delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const headers: Record<string, string> = {}
    let serializedBody: string | undefined

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      serializedBody = JSON.stringify(body)
    }

    return this.request<T>(path, {
      ...options,
      method: 'DELETE',
      headers: {
        ...headers,
        ...options?.headers,
      },
      body: serializedBody,
    })
  }
}

export const apiClient = new ApiClient('/api')
