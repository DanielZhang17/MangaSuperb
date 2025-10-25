import request from '@/service'
import type {
  CreateCharacterRequest,
  CreateCharacterResponse,
  GetCharacterResponse,
  ListCharactersResponse,
} from '@/service/types'

export const CharactersApi = {
  // Create a character (may enqueue background image generation)
  create(body: CreateCharacterRequest) {
    return request<CreateCharacterRequest, CreateCharacterResponse>({
      url: '/api/characters',
      method: 'POST',
      data: body,
    })
  },

  // Get a single character by id
  get(characterId: number) {
    return request<void, GetCharacterResponse>({
      url: `/api/characters/${characterId}`,
      method: 'GET',
    })
  },

  // List characters owned by the current user (API may support pagination later)
  list() {
    return request<void, ListCharactersResponse>({
      url: '/api/characters',
      method: 'GET',
    })
  },
}

export default CharactersApi
