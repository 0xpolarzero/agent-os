declare const pkg: {
    name: string;
    aptName: string;
    description: string;
    source: "rust";
    commands: {
        name: string;
        permissionTier: "full";
    }[];
    readonly commandDir: string;
};
export default pkg;
