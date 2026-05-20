/**
 * Cobblemon mod template — Fabric 1.21.1 + Kotlin DSL.
 * Returns a list of files to push to the new GitHub repo.
 *
 * Variables interpolated:
 *   - modId        : "cobblemod_foo"   (snake_case, used in code & resources)
 *   - modName      : "Foo Mod"         (human display name)
 *   - modGroup     : "com.example.foo" (Java/Kotlin package)
 *   - mainClass    : "FooMod"          (PascalCase class name)
 *   - authors      : "Dubenzo, Alice"  (free text)
 *   - description  : "A Cobblemon side-mod that adds X."
 */

export type TemplateVars = {
  modId: string
  modName: string
  modGroup: string
  mainClass: string
  authors: string
  description: string
}

export type TemplateFile = { path: string; content: string }

const FABRIC_LOADER = '0.16.7'
const FABRIC_API = '0.110.0+1.21.1'
const FABRIC_KOTLIN = '1.13.0+kotlin.2.0.21'
const MINECRAFT = '1.21.1'
const YARN = '1.21.1+build.3'
const KOTLIN = '2.0.21'
const COBBLEMON = '1.7.1+1.21.1'

export function buildCobblemonTemplate(v: TemplateVars): TemplateFile[] {
  const groupPath = v.modGroup.replace(/\./g, '/')
  return [
    { path: 'README.md', content: readme(v) },
    { path: '.gitignore', content: gitignore() },
    { path: '.gitattributes', content: gitattributes() },
    { path: 'LICENSE', content: licenseMIT(v) },
    { path: 'gradle.properties', content: gradleProps(v) },
    { path: 'settings.gradle.kts', content: settingsGradle(v) },
    { path: 'build.gradle.kts', content: buildGradle(v) },
    { path: 'gradle/wrapper/gradle-wrapper.properties', content: gradleWrapper() },
    {
      path: `src/main/kotlin/${groupPath}/${v.mainClass}.kt`,
      content: mainKotlin(v),
    },
    { path: 'src/main/resources/fabric.mod.json', content: fabricModJson(v) },
    {
      path: `src/main/resources/assets/${v.modId}/lang/en_us.json`,
      content: langJson(v),
    },
    {
      path: `src/main/resources/assets/${v.modId}/lang/fr_fr.json`,
      content: langJsonFR(v),
    },
    {
      path: `src/main/resources/data/${v.modId}/.gitkeep`,
      content: '',
    },
    { path: '.github/workflows/build.yml', content: ghActionsBuild() },
  ]
}

function readme(v: TemplateVars) {
  return `# ${v.modName}

${v.description}

A Cobblemon side-mod for Minecraft **${MINECRAFT}** (Fabric).

## Build

\`\`\`bash
./gradlew build
\`\`\`

The built JAR lands in \`build/libs/${v.modId}-*.jar\`.

## Dev environment

\`\`\`bash
./gradlew runClient   # Launches a dev client
./gradlew runServer   # Launches a dev server
\`\`\`

## Dependencies

| Mod | Version |
|---|---|
| Minecraft | ${MINECRAFT} |
| Fabric Loader | ${FABRIC_LOADER} |
| Fabric API | ${FABRIC_API} |
| Fabric Language Kotlin | ${FABRIC_KOTLIN} |
| Cobblemon | ${COBBLEMON} |

## Authors

${v.authors}
`
}

function gitignore() {
  return `# Gradle
.gradle/
build/
out/
classes/

# IDEA
.idea/
*.iml
*.ipr
*.iws

# VS Code
.vscode/
.project
.classpath
.settings/

# Misc
*.log
run/
runs/
.DS_Store
`
}

function gitattributes() {
  return `* text=auto eol=lf
*.bat text eol=crlf
*.jar binary
*.png binary
*.ogg binary
gradlew text eol=lf
`
}

function licenseMIT(v: TemplateVars) {
  const year = new Date().getFullYear()
  return `MIT License

Copyright (c) ${year} ${v.authors}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`
}

function gradleProps(v: TemplateVars) {
  return `# Done to increase the memory available to gradle.
org.gradle.jvmargs=-Xmx2G
org.gradle.parallel=true

# Fabric
minecraft_version=${MINECRAFT}
yarn_mappings=${YARN}
loader_version=${FABRIC_LOADER}
fabric_version=${FABRIC_API}
fabric_kotlin_version=${FABRIC_KOTLIN}

# Kotlin
kotlin_version=${KOTLIN}

# Cobblemon
cobblemon_version=${COBBLEMON}

# Mod identity
mod_version=0.1.0
maven_group=${v.modGroup}
archives_base_name=${v.modId}
`
}

function settingsGradle(v: TemplateVars) {
  return `pluginManagement {
    repositories {
        maven("https://maven.fabricmc.net/") { name = "Fabric" }
        maven("https://maven.architectury.dev/")
        gradlePluginPortal()
    }
}

rootProject.name = "${v.modId}"
`
}

function buildGradle(v: TemplateVars) {
  return `plugins {
    id("fabric-loom") version "1.7.4"
    kotlin("jvm") version "${KOTLIN}"
}

val modVersion = project.property("mod_version") as String
val mavenGroup = project.property("maven_group") as String
val archivesBaseName = project.property("archives_base_name") as String

version = modVersion
group = mavenGroup

base { archivesName.set(archivesBaseName) }

repositories {
    maven("https://maven.impactdev.net/repository/development/") { name = "Cobblemon" }
    maven("https://thedarkcolour.github.io/KotlinForForge/") { name = "KotlinForForge" }
    maven("https://maven.terraformersmc.com/")
    maven("https://maven.shedaniel.me/")
    mavenCentral()
}

dependencies {
    minecraft("com.mojang:minecraft:\${project.property("minecraft_version")}")
    mappings("net.fabricmc:yarn:\${project.property("yarn_mappings")}:v2")
    modImplementation("net.fabricmc:fabric-loader:\${project.property("loader_version")}")
    modImplementation("net.fabricmc.fabric-api:fabric-api:\${project.property("fabric_version")}")
    modImplementation("net.fabricmc:fabric-language-kotlin:\${project.property("fabric_kotlin_version")}")

    // Cobblemon
    modImplementation("com.cobblemon:fabric:\${project.property("cobblemon_version")}")
}

tasks.processResources {
    inputs.property("version", project.version)
    filesMatching("fabric.mod.json") {
        expand(mapOf("version" to project.version))
    }
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.release.set(21)
}

kotlin {
    jvmToolchain(21)
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
    withSourcesJar()
}

tasks.jar {
    from("LICENSE") {
        rename { "\${it}_\${project.base.archivesName.get()}" }
    }
}
`
}

function gradleWrapper() {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`
}

function mainKotlin(v: TemplateVars) {
  return `package ${v.modGroup}

import com.cobblemon.mod.common.api.events.CobblemonEvents
import net.fabricmc.api.ModInitializer
import org.slf4j.LoggerFactory

/**
 * Main entry point for ${v.modName}.
 *
 * Hooks into Cobblemon's event system here. Examples:
 *   CobblemonEvents.POKEMON_CAPTURED.subscribe { ... }
 *   CobblemonEvents.POKEMON_FAINTED.subscribe { ... }
 *
 * See https://gitlab.com/cable-mc/cobblemon/-/wikis/home for the full API.
 */
object ${v.mainClass} : ModInitializer {
    const val MOD_ID = "${v.modId}"
    val LOGGER = LoggerFactory.getLogger(MOD_ID)

    override fun onInitialize() {
        LOGGER.info("[\${MOD_ID}] Initializing ${v.modName} on top of Cobblemon")

        // Example: log every successful capture
        // CobblemonEvents.POKEMON_CAPTURED.subscribe { event ->
        //     LOGGER.info("\${event.player.name.string} captured \${event.pokemon.species.name}")
        // }
    }
}
`
}

function fabricModJson(v: TemplateVars) {
  const authors = v.authors
    .split(',')
    .map((a) => `"${a.trim()}"`)
    .join(', ')
  return `{
  "schemaVersion": 1,
  "id": "${v.modId}",
  "version": "\${version}",
  "name": "${v.modName}",
  "description": "${v.description.replace(/"/g, '\\"')}",
  "authors": [${authors}],
  "contact": {},
  "license": "MIT",
  "environment": "*",
  "entrypoints": {
    "main": [
      {
        "adapter": "kotlin",
        "value": "${v.modGroup}.${v.mainClass}"
      }
    ]
  },
  "depends": {
    "fabricloader": ">=${FABRIC_LOADER}",
    "minecraft": "~${MINECRAFT}",
    "java": ">=21",
    "fabric-language-kotlin": ">=${FABRIC_KOTLIN.split('+')[0]}",
    "cobblemon": ">=1.7.0"
  }
}
`
}

function langJson(v: TemplateVars) {
  return `{
  "modmenu.summaryTranslation.${v.modId}": "${v.description}"
}
`
}

function langJsonFR(v: TemplateVars) {
  return `{
  "modmenu.summaryTranslation.${v.modId}": "${v.description}"
}
`
}

function ghActionsBuild() {
  return `name: build

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
      - run: ./gradlew build --no-daemon
      - name: Upload artifact
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: jar
          path: build/libs/*.jar
          if-no-files-found: error
          retention-days: 30
`
}
