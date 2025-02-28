import { Text, ToastId, useColorModeValue } from "@chakra-ui/react"
import { useRumAction, useRumError } from "@datadog/rum-react-integration"
import { useWeb3React } from "@web3-react/core"
import Button from "components/common/Button"
import useGuild from "components/[guild]/hooks/useGuild"
import useUser from "components/[guild]/hooks/useUser"
import { manageKeyPairAfterUserMerge } from "hooks/useKeyPair"
import { useSubmitWithSign, WithValidation } from "hooks/useSubmit"
import useToast from "hooks/useToast"
import { useRouter } from "next/router"
import { TwitterLogo } from "phosphor-react"
import { useRef } from "react"
import { mutate } from "swr"
import { PlatformName } from "types"
import fetcher, { useFetcherWithSign } from "utils/fetcher"

type PlatformResult = {
  platformId: number
  platformName: PlatformName
} & (
  | { success: true }
  | {
      success: false
      errorMsg: "Unknown Member"
      invite: string
    }
)

type Response = {
  success: boolean
  platformResults: PlatformResult[]
}

export type JoinData =
  | {
      oauthData: any
    }
  | {
      hash: string
    }

const useJoin = (onSuccess?: () => void) => {
  const router = useRouter()
  const { account } = useWeb3React()
  const addDatadogAction = useRumAction("trackingAppAction")
  const addDatadogError = useRumError()

  const guild = useGuild()
  const user = useUser()
  const fetcherWithSign = useFetcherWithSign()

  const toast = useToast()
  const toastIdRef = useRef<ToastId>()
  const tweetButtonBackground = useColorModeValue("blackAlpha.100", undefined)

  const submit = ({
    data,
    validation,
  }: WithValidation<unknown>): Promise<Response> =>
    fetcher(`/user/join`, {
      body: data,
      validation,
    }).then((body) => {
      if (body === "rejected") {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw "Something went wrong, join request rejected."
      }

      if (typeof body === "string") {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw body
      }

      return manageKeyPairAfterUserMerge(fetcherWithSign, user, account).then(
        () => body
      )
    })

  const useSubmitResponse = useSubmitWithSign<any, Response>(submit, {
    // Revalidating the address list in the AccountModal component
    onSuccess: (response) => {
      // show in account modal if new platform/address got connected
      mutate(`/user/${account}`)

      if (!response.success) return

      addDatadogAction(`Successfully joined a guild`)

      mutate(`/user/membership/${account}`)
      // show user in guild's members
      mutate(`/guild/${router.query.guild}`)

      toastIdRef.current = toast({
        title: `Successfully joined guild`,
        duration: 8000,
        description: (
          <>
            <Text>Let others know as well by sharing it on Twitter</Text>
            <Button
              as="a"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                `Just joined the ${guild.name} guild. Continuing my brave quest to explore all corners of web3!
guild.xyz/${guild.urlName} @guildxyz`
              )}`}
              target="_blank"
              bg={tweetButtonBackground}
              leftIcon={<TwitterLogo weight="fill" />}
              size="sm"
              onClick={() => toast.close(toastIdRef.current)}
              mt={3}
              mb="1"
              borderRadius="lg"
            >
              Share
            </Button>
          </>
        ),
        status: "success",
      })

      onSuccess?.()
    },
    onError: (err) => {
      addDatadogError(`Guild join error`, { error: err }, "custom")
    },
  })

  return {
    ...useSubmitResponse,
    onSubmit: (data) =>
      useSubmitResponse.onSubmit({
        guildId: guild?.id,
        platforms: Object.entries(data.platforms)
          .filter(([key, value]) => !!value)
          .map(([key, value]: any) => ({
            name: key,
            ...value,
          })),
      }),
  }
}

export default useJoin
