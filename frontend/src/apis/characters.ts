import request from '@/service'
import type {
  CreateCharacterRequest,
  CreateCharacterResponse,
  DeleteCharacterResponse,
  GetCharacterResponse,
  ListCharactersResponse,
  UpdateCharacterNameRequest,
  UpdateCharacterNameResponse,
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
      // Add a cache buster to ensure fresh status during polling
      params: { _: Date.now() },
    })
  },

  // List characters owned by the current user (API may support pagination later)
  list() {
    return request<void, ListCharactersResponse>({
      url: '/api/characters',
      method: 'GET',
    })
  },

  // Update character name
  updateName(characterId: number, body: UpdateCharacterNameRequest) {
    return request<UpdateCharacterNameRequest, UpdateCharacterNameResponse>({
      url: `/api/characters/${characterId}/name`,
      method: 'PATCH',
      data: body,
    })
  },

  // Delete a character
  delete(characterId: number) {
    return request<void, DeleteCharacterResponse>({
      url: `/api/characters/${characterId}`,
      method: 'DELETE',
    })
  },
}

export default CharactersApi
