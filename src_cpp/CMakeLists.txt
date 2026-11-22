cmake_minimum_required(VERSION 3.16)
project(cs15_whisk3d LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 11)

if(NOT DEFINED WHISK3D_CORE_DIR)
    set(WHISK3D_CORE_DIR "/tmp/whisk3d-core" CACHE PATH "Path to Whisk3D-Core repository")
endif()

find_package(SDL2 REQUIRED)
find_package(OpenGL REQUIRED)

include_directories(
    ${WHISK3D_CORE_DIR}
    ${WHISK3D_CORE_DIR}/base
    ${WHISK3D_CORE_DIR}/graphics
    ${WHISK3D_CORE_DIR}/io
    ${WHISK3D_CORE_DIR}/thirdparty
)

add_definitions(-DW3D_STB_IMPL)

add_executable(cs15_whisk3d
    main.cpp
    ${WHISK3D_CORE_DIR}/base/w3dlog.cpp
    ${WHISK3D_CORE_DIR}/math/Matrix4.cpp
    ${WHISK3D_CORE_DIR}/math/Vector3.cpp
    ${WHISK3D_CORE_DIR}/math/Quaternion.cpp
    ${WHISK3D_CORE_DIR}/objects/CameraBase.cpp
    ${WHISK3D_CORE_DIR}/objects/VisBsp.cpp
    ${WHISK3D_CORE_DIR}/objects/MundoBsp.cpp
    ${WHISK3D_CORE_DIR}/graphics/w3dTexture.cpp
    ${WHISK3D_CORE_DIR}/graphics/opengl/w3dGraphics.cpp
    ${WHISK3D_CORE_DIR}/io/w3dFilesystem.cpp
)

target_link_libraries(cs15_whisk3d SDL2::SDL2 OpenGL::GL)
