if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "C:/Users/shukl/.gradle/caches/8.13/transforms/0b29983d5fb8978aef2250d9a155f833/transformed/jetified-hermes-android-0.75.4-debug/prefab/modules/libhermes/libs/android.arm64-v8a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/shukl/.gradle/caches/8.13/transforms/0b29983d5fb8978aef2250d9a155f833/transformed/jetified-hermes-android-0.75.4-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

