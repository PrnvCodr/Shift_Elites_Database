cmake_minimum_required(VERSION 3.20)
project(ShiftEliteDB VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# nlohmann/json - fetch from GitHub
include(FetchContent)
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

# Source files
file(GLOB_RECURSE SOURCES "src/*.cpp")

# Main library
add_library(shift_elite_core STATIC ${SOURCES})
target_include_directories(shift_elite_core PUBLIC src)
target_link_libraries(shift_elite_core PUBLIC nlohmann_json::nlohmann_json)

if(WIN32)
    target_link_libraries(shift_elite_core PUBLIC ws2_32)
endif()

# Server executable
add_executable(shift_elite_server src/main.cpp)
target_link_libraries(shift_elite_server PRIVATE shift_elite_core)

# Install
install(TARGETS shift_elite_server DESTINATION bin)
