#pragma once

#include "pch.h"
#include "NativeModules.h"

#include <wincred.h>
#include <optional>
#include <string>

namespace winrt::OficinaInteligente {

constexpr size_t MAX_SESSION_BLOB_BYTES = 2560;

REACT_MODULE(SecureCredentialStorage)
struct SecureCredentialStorage {
  REACT_METHOD(getItem)
  void getItem(std::string const &key, React::ReactPromise<std::optional<std::string>> &&result) noexcept {
    PCREDENTIALW stored = nullptr;
    try {
      const auto targetName = makeTargetName(key);
      if (!targetName) {
        result.Reject(L"A chave da sessão não é válida.");
        return;
      }

      if (!CredReadW(targetName->c_str(), CRED_TYPE_GENERIC, 0, &stored)) {
        if (GetLastError() == ERROR_NOT_FOUND) {
          result.Resolve(std::nullopt);
          return;
        }
        result.Reject(L"Não foi possível recuperar a sessão no Cofre de Credenciais do Windows.");
        return;
      }

      const auto *bytes = reinterpret_cast<const char *>(stored->CredentialBlob);
      const auto size = static_cast<size_t>(stored->CredentialBlobSize);
      std::string value;
      if (size > 0) value.assign(bytes, size);
      CredFree(stored);
      stored = nullptr;
      result.Resolve(value);
    } catch (...) {
      if (stored) CredFree(stored);
      result.Reject(L"Não foi possível recuperar a sessão no Cofre de Credenciais do Windows.");
    }
  }

  REACT_METHOD(setItem)
  void setItem(std::string const &key, std::string const &value, React::ReactPromise<void> &&result) noexcept {
    try {
      const auto targetName = makeTargetName(key);
      if (!targetName) {
        result.Reject(L"A chave da sessão não é válida.");
        return;
      }
      if (value.size() > MAX_SESSION_BLOB_BYTES) {
        result.Reject(L"A sessão excede o limite seguro de armazenamento do Windows.");
        return;
      }

      CREDENTIALW credential{};
      credential.Type = CRED_TYPE_GENERIC;
      credential.TargetName = const_cast<LPWSTR>(targetName->c_str());
      credential.UserName = const_cast<LPWSTR>(L"sessao-supabase");
      credential.CredentialBlobSize = static_cast<DWORD>(value.size());
      credential.CredentialBlob = value.empty()
          ? nullptr
          : reinterpret_cast<LPBYTE>(const_cast<char *>(value.data()));
      credential.Persist = CRED_PERSIST_LOCAL_MACHINE;

      if (!CredWriteW(&credential, 0)) {
        result.Reject(L"Não foi possível salvar a sessão no Cofre de Credenciais do Windows.");
        return;
      }
      result.Resolve();
    } catch (...) {
      result.Reject(L"Não foi possível salvar a sessão no Cofre de Credenciais do Windows.");
    }
  }

  REACT_METHOD(removeItem)
  void removeItem(std::string const &key, React::ReactPromise<void> &&result) noexcept {
    try {
      const auto targetName = makeTargetName(key);
      if (!targetName) {
        result.Reject(L"A chave da sessão não é válida.");
        return;
      }
      if (!CredDeleteW(targetName->c_str(), CRED_TYPE_GENERIC, 0) && GetLastError() != ERROR_NOT_FOUND) {
        result.Reject(L"Não foi possível remover a sessão do Cofre de Credenciais do Windows.");
        return;
      }
      result.Resolve();
    } catch (...) {
      result.Reject(L"Não foi possível remover a sessão do Cofre de Credenciais do Windows.");
    }
  }

 private:
  static std::optional<std::wstring> makeTargetName(std::string const &key) {
    constexpr wchar_t prefix[] = L"OficinaInteligente.Supabase.";
    if (key.empty() || key.size() > 240) return std::nullopt;

    std::wstring target(prefix);
    target.reserve(target.size() + key.size());
    for (const unsigned char character : key) {
      if (!((character >= 'a' && character <= 'z') ||
            (character >= 'A' && character <= 'Z') ||
            (character >= '0' && character <= '9') ||
            character == '-' || character == '_' || character == '.')) {
        return std::nullopt;
      }
      target.push_back(static_cast<wchar_t>(character));
    }
    return target;
  }
};

} // namespace winrt::OficinaInteligente
